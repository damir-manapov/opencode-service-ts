import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { createOpencode } from "@opencode-ai/sdk";
import type {
  ChatMessage,
  ExecutorResult,
  ModelSelection,
  StreamChunk,
} from "../chat/chat.types.js";
import { ConfigService } from "../config/config.service.js";
import type {
  AgentDefinition,
  ToolDefinition,
  WorkspaceConfig,
} from "../workspace/workspace.types.js";

type OpencodeInstance = Awaited<ReturnType<typeof createOpencode>>;
type OpencodeClient = OpencodeInstance["client"];

interface PooledInstance {
  instance: OpencodeInstance;
  port: number;
  workspacePath: string;
  lastUsed: number;
  idleTimer: NodeJS.Timeout | null;
}

export interface ExecuteOptions {
  tenantId: string;
  workspaceConfig: WorkspaceConfig;
  messages: ChatMessage[];
  model?: ModelSelection;
  /** Provider credentials in format { providerId: apiKey } */
  providerCredentials?: Record<string, string>;
}

@Injectable()
export class OpencodeExecutorService implements OnModuleDestroy {
  private readonly logger = new Logger(OpencodeExecutorService.name);
  private readonly hostname = "127.0.0.1";
  private readonly timeout = 30000;
  private readonly idleTimeoutMs: number;
  private readonly baseDir: string;
  private nextPort = 14096;

  /** Map of instanceKey (tenantId:toolHash) -> running OpenCode instance */
  private readonly instances = new Map<string, PooledInstance>();

  constructor(private readonly configService: ConfigService) {
    this.idleTimeoutMs = this.configService.get("idleTimeout");
    this.baseDir = path.join(os.tmpdir(), "opencode-service");
    this.logger.log(`Idle timeout: ${this.idleTimeoutMs / 1000}s, base dir: ${this.baseDir}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.shutdownAll();
  }

  /**
   * Execute OpenCode with the given workspace config and messages
   * Pools instances by tenantId + tool configuration hash
   */
  async execute(options: ExecuteOptions): Promise<ExecutorResult> {
    const { tenantId, workspaceConfig, messages, model, providerCredentials } = options;

    // Get or create instance based on tenant + tool hash
    const pooledInstance = await this.getOrCreateInstance(tenantId, workspaceConfig);
    const client = pooledInstance.instance.client;

    // Update last used and reset idle timer
    const instanceKey = this.computeInstanceKey(tenantId, workspaceConfig);
    this.touchInstance(instanceKey);

    try {
      // Set provider credentials via OpenCode auth API
      if (providerCredentials) {
        await this.setProviderCredentials(client, providerCredentials, pooledInstance.workspacePath);
      }

      const prompt = this.buildPrompt(messages);
      const providerID = model?.providerId ?? "anthropic";
      const modelID = model?.modelId ?? "claude-sonnet-4-20250514";

      this.logger.log(`Executing: ${providerID}/${modelID} for ${instanceKey}`);

      // Create session
      const createResponse = await client.session.create({
        body: { title: "OpenCode Service Request" },
      });

      if (!createResponse.data) {
        const errorDetail =
          createResponse.error && "detail" in createResponse.error
            ? String(createResponse.error.detail)
            : JSON.stringify(createResponse.error) || "Unknown error";
        throw new Error(`Failed to create session: ${errorDetail}`);
      }

      const session = createResponse.data;

      try {
        // Subscribe to events and send prompt
        const eventResponse = await client.event.subscribe();

        await client.session.promptAsync({
          path: { id: session.id },
          body: {
            model: { providerID, modelID },
            parts: [{ type: "text", text: prompt }],
            ...(model?.agentId && { agent: model.agentId }),
          },
        });

        // Collect response from events
        const textParts: string[] = [];
        const toolCalls: ExecutorResult["toolCalls"] = [];
        const RESPONSE_TIMEOUT = 30000;
        const startTime = Date.now();

        for await (const event of eventResponse.stream) {
          if (Date.now() - startTime > RESPONSE_TIMEOUT) {
            throw new Error(`Response timeout after ${RESPONSE_TIMEOUT}ms`);
          }

          if (event.type === "message.part.updated") {
            const props = event.properties as {
              part?: {
                type?: string;
                tool?: string;
                metadata?: Record<string, unknown>;
                state?: string;
              };
              delta?: string;
            };
            if (props.delta && props.part?.type === "text") {
              textParts.push(props.delta);
            }
            if (props.part?.type === "tool" && props.part.tool) {
              toolCalls.push({
                name: props.part.tool,
                input: props.part.metadata ?? {},
                output: props.part.state,
              });
            }
          }

          if (event.type === "session.idle") {
            const props = event.properties as { sessionID?: string };
            if (props.sessionID === session.id) break;
          }

          if (event.type === "session.error") {
            const props = event.properties as {
              sessionID?: string;
              error?: { message?: string; data?: { message?: string } };
            };
            if (props.sessionID === session.id) {
              throw new Error(this.parseSessionError(props.error));
            }
          }
        }

        const content = textParts.join("") || "No response generated";
        this.logger.log(`Response: ${content.slice(0, 100)}...`);

        return { content, toolCalls };
      } finally {
        await client.session.delete({ path: { id: session.id } }).catch(() => {});
      }
    } catch (error) {
      // On error, shutdown this instance to ensure clean state next time
      const instanceKey = this.computeInstanceKey(tenantId, workspaceConfig);
      this.logger.warn(`Error for ${instanceKey}, shutting down instance`);
      await this.shutdownInstance(instanceKey);
      throw error;
    }
  }

  /**
   * Execute OpenCode with streaming response
   */
  async *executeStreaming(options: ExecuteOptions): AsyncGenerator<StreamChunk, void, undefined> {
    // TODO: Implement proper streaming with SDK event subscription
    const result = await this.execute(options);

    for (const toolCall of result.toolCalls) {
      yield { type: "tool_call", toolCall };
    }

    yield { type: "text", content: result.content };
    yield { type: "done" };
  }

  /**
   * Shutdown instance by key (e.g., on error or idle timeout)
   */
  async shutdownInstance(instanceKey: string): Promise<void> {
    const pooledInstance = this.instances.get(instanceKey);
    if (pooledInstance) {
      if (pooledInstance.idleTimer) {
        clearTimeout(pooledInstance.idleTimer);
      }
      this.logger.log(`Shutting down OpenCode instance: ${instanceKey}`);
      pooledInstance.instance.server.close();
      this.instances.delete(instanceKey);

      // Cleanup workspace directory
      try {
        await fs.rm(pooledInstance.workspacePath, { recursive: true, force: true });
        this.logger.debug(`Cleaned up workspace: ${pooledInstance.workspacePath}`);
      } catch (err) {
        this.logger.warn(`Failed to cleanup workspace: ${pooledInstance.workspacePath}`, err);
      }
    }
  }

  /**
   * Shutdown all instances for a tenant
   */
  async shutdownTenant(tenantId: string): Promise<void> {
    const prefix = `${tenantId}:`;
    const keysToShutdown = [...this.instances.keys()].filter((k) => k.startsWith(prefix));
    for (const key of keysToShutdown) {
      await this.shutdownInstance(key);
    }
  }

  /**
   * Shutdown all instances (on module destroy)
   */
  private async shutdownAll(): Promise<void> {
    this.logger.log(`Shutting down all OpenCode instances (${this.instances.size} active)`);
    for (const key of this.instances.keys()) {
      await this.shutdownInstance(key);
    }
  }

  /**
   * Compute instance key from tenant + tool configuration
   */
  private computeInstanceKey(tenantId: string, config: WorkspaceConfig): string {
    const fingerprint = {
      tools: config.tools.map((t) => t.name).sort(),
    };
    const hash = createHash("sha256")
      .update(JSON.stringify(fingerprint))
      .digest("hex")
      .slice(0, 12);
    return `${tenantId}:${hash}`;
  }

  /**
   * Get existing instance or create new one
   * Instance is keyed by tenant + tool hash
   * Agents are updated in-place on each request
   */
  private async getOrCreateInstance(
    tenantId: string,
    config: WorkspaceConfig,
  ): Promise<PooledInstance> {
    const instanceKey = this.computeInstanceKey(tenantId, config);
    const existing = this.instances.get(instanceKey);

    if (existing) {
      // Update agents in-place (cheap file writes)
      await this.writeAgents(existing.workspacePath, config.agents);
      this.logger.debug(`Reusing instance: ${instanceKey}`);
      return existing;
    }

    // Create new workspace and instance
    const workspacePath = await this.createWorkspace(instanceKey, config);
    const port = await this.findAvailablePort();
    const originalCwd = process.cwd();

    this.logger.log(`Creating new instance: ${instanceKey}`);

    try {
      process.chdir(workspacePath);
      const instance = await createOpencode({
        hostname: this.hostname,
        port,
        timeout: this.timeout,
      });

      const pooledInstance: PooledInstance = {
        instance,
        port,
        workspacePath,
        lastUsed: Date.now(),
        idleTimer: null,
      };

      this.instances.set(instanceKey, pooledInstance);
      this.logger.log(`Instance ${instanceKey} started on port ${port}`);

      return pooledInstance;
    } finally {
      process.chdir(originalCwd);
    }
  }

  /**
   * Create workspace directory with tools and agents
   */
  private async createWorkspace(instanceKey: string, config: WorkspaceConfig): Promise<string> {
    const workspacePath = path.join(this.baseDir, instanceKey.replace(":", "-"));
    const opencodeDir = path.join(workspacePath, ".opencode");
    const agentDir = path.join(opencodeDir, "agent");
    const toolDir = path.join(opencodeDir, "tool");

    // Create directories
    await fs.mkdir(agentDir, { recursive: true });
    await fs.mkdir(toolDir, { recursive: true });

    // Write tools
    await this.writeTools(workspacePath, config.tools);

    // Write agents
    await this.writeAgents(workspacePath, config.agents);

    // Write opencode.json
    await this.writeOpencodeConfig(workspacePath, config);

    return workspacePath;
  }

  /**
   * Write tools to workspace (only on workspace creation)
   */
  private async writeTools(workspacePath: string, tools: ToolDefinition[]): Promise<void> {
    const toolDir = path.join(workspacePath, ".opencode", "tool");
    for (const tool of tools) {
      const toolPath = path.join(toolDir, `${tool.name}.ts`);
      await fs.writeFile(toolPath, tool.source, "utf-8");
    }
  }

  /**
   * Write agents to workspace (called on every request)
   */
  private async writeAgents(workspacePath: string, agents: AgentDefinition[]): Promise<void> {
    const agentDir = path.join(workspacePath, ".opencode", "agent");
    for (const agent of agents) {
      const agentPath = path.join(agentDir, `${agent.name}.md`);
      await fs.writeFile(agentPath, agent.content, "utf-8");
    }
  }

  /**
   * Write opencode.json configuration
   */
  private async writeOpencodeConfig(workspacePath: string, config: WorkspaceConfig): Promise<void> {
    const opencodeConfig: Record<string, unknown> = {
      $schema: "https://opencode.ai/config.json",
    };

    if (config.requestModel) {
      opencodeConfig.model = `${config.requestModel.providerId}/${config.requestModel.modelId}`;
    } else if (config.defaultModel) {
      opencodeConfig.model = `${config.defaultModel.providerId}/${config.defaultModel.modelId}`;
    }

    await fs.writeFile(
      path.join(workspacePath, "opencode.json"),
      JSON.stringify(opencodeConfig, null, 2),
      "utf-8",
    );
  }

  /**
   * Update last used time and reset idle timer
   */
  private touchInstance(instanceKey: string): void {
    const pooledInstance = this.instances.get(instanceKey);
    if (!pooledInstance) return;

    pooledInstance.lastUsed = Date.now();

    // Clear existing timer
    if (pooledInstance.idleTimer) {
      clearTimeout(pooledInstance.idleTimer);
    }

    // Set new idle timer
    pooledInstance.idleTimer = setTimeout(() => {
      this.logger.log(`Instance ${instanceKey} idle for ${this.idleTimeoutMs / 1000}s, shutting down`);
      this.shutdownInstance(instanceKey);
    }, this.idleTimeoutMs);
  }

  /**
   * Find an available port by checking if it's in use
   */
  private async findAvailablePort(maxAttempts = 20): Promise<number> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const port = this.nextPort++;
      if (this.nextPort > 15000) this.nextPort = 14096;

      const isAvailable = await this.isPortAvailable(port);
      if (isAvailable) {
        return port;
      }
      this.logger.debug(`Port ${port} in use, trying next...`);
    }
    throw new Error(`Could not find available port after ${maxAttempts} attempts`);
  }

  /**
   * Check if a port is available by attempting to listen on it
   */
  private isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once("error", () => resolve(false));
      server.once("listening", () => {
        server.close(() => resolve(true));
      });
      server.listen(port, this.hostname);
    });
  }

  private buildPrompt(messages: ChatMessage[]): string {
    return messages
      .map((msg) => {
        const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
        return `${role}: ${msg.content}`;
      })
      .join("\n\n");
  }

  private async setProviderCredentials(
    client: OpencodeClient,
    credentials: Record<string, string>,
    directory: string,
  ): Promise<void> {
    for (const [providerId, apiKey] of Object.entries(credentials)) {
      const response = await client.auth.set({
        path: { id: providerId },
        query: { directory },
        body: { type: "api", key: apiKey },
      });
      if (response.error) {
        this.logger.warn(`Failed to set credentials for ${providerId}`);
      }
    }
  }

  /**
   * Parse session error to extract meaningful error message
   */
  private parseSessionError(error: unknown): string {
    if (!error || typeof error !== "object") return "Unknown session error";

    const err = error as { message?: string; data?: { message?: string } };

    if (err.data?.message) {
      try {
        const parsed = JSON.parse(err.data.message) as {
          error?: { type?: string; message?: string; code?: string };
          message?: string;
        };
        if (parsed.error?.message) {
          const code = parsed.error.code || parsed.error.type;
          return code ? `[${code}] ${parsed.error.message}` : parsed.error.message;
        }
        if (parsed.message) return parsed.message;
      } catch {
        return err.data.message;
      }
    }

    return err.message ?? JSON.stringify(error);
  }
}
