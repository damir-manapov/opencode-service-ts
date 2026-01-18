import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import * as fs from "node:fs/promises";
import * as net from "node:net";
import * as path from "node:path";
import { createOpencode } from "@opencode-ai/sdk";
import type {
  ChatMessage,
  ExecutorResult,
  ModelSelection,
  StreamChunk,
} from "../chat/chat.types.js";
import { ConfigService } from "../config/config.service.js";
import type { WorkspaceConfig } from "../workspace/workspace.types.js";
import { WorkspaceService } from "../workspace/workspace.service.js";

type OpencodeInstance = Awaited<ReturnType<typeof createOpencode>>;
type OpencodeClient = OpencodeInstance["client"];

interface TenantInstance {
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
  private nextPort = 14096;

  /** Map of tenantId -> running OpenCode instance */
  private readonly instances = new Map<string, TenantInstance>();

  constructor(
    private readonly configService: ConfigService,
    private readonly workspaceService: WorkspaceService,
  ) {
    this.idleTimeoutMs = this.configService.get("idleTimeout");
    this.logger.log(`Idle timeout: ${this.idleTimeoutMs / 1000}s`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.shutdownAll();
  }

  /**
   * Execute OpenCode with the given workspace config and messages
   * Uses per-tenant instance pooling with idle timeout
   * Manages workspace creation and lifecycle internally
   */
  async execute(options: ExecuteOptions): Promise<ExecutorResult> {
    const { tenantId, workspaceConfig, messages, model, providerCredentials } = options;

    // Get or create instance (creates workspace if needed)
    const tenantInstance = await this.getOrCreateInstance(tenantId, workspaceConfig);
    const client = tenantInstance.instance.client;

    // Update last used and reset idle timer
    this.touchInstance(tenantId);

    try {
      // Set provider credentials via OpenCode auth API
      if (providerCredentials) {
        await this.setProviderCredentials(client, providerCredentials, tenantInstance.workspacePath);
      }

      const prompt = this.buildPrompt(messages);
      const providerID = model?.providerId ?? "anthropic";
      const modelID = model?.modelId ?? "claude-sonnet-4-20250514";

      this.logger.log(`Executing: ${providerID}/${modelID} for tenant ${tenantId}`);

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
      this.logger.warn(`Error for tenant ${tenantId}, shutting down instance`);
      await this.shutdownInstance(tenantId);
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
   * Shutdown instance for a specific tenant (e.g., on tenant deletion)
   */
  async shutdownInstance(tenantId: string): Promise<void> {
    const tenantInstance = this.instances.get(tenantId);
    if (tenantInstance) {
      if (tenantInstance.idleTimer) {
        clearTimeout(tenantInstance.idleTimer);
      }
      this.logger.log(`Shutting down OpenCode for tenant ${tenantId}`);
      tenantInstance.instance.server.close();
      this.instances.delete(tenantId);

      // Cleanup workspace directory
      try {
        await fs.rm(tenantInstance.workspacePath, { recursive: true, force: true });
        this.logger.debug(`Cleaned up workspace: ${tenantInstance.workspacePath}`);
      } catch (err) {
        this.logger.warn(`Failed to cleanup workspace: ${tenantInstance.workspacePath}`, err);
      }
    }
  }

  /**
   * Shutdown all instances (on module destroy)
   */
  private async shutdownAll(): Promise<void> {
    this.logger.log(`Shutting down all OpenCode instances (${this.instances.size} active)`);
    for (const tenantId of this.instances.keys()) {
      await this.shutdownInstance(tenantId);
    }
  }

  /**
   * Get existing instance or create new one for tenant
   * Creates workspace on first request, syncs content on subsequent requests
   */
  private async getOrCreateInstance(
    tenantId: string,
    workspaceConfig: WorkspaceConfig,
  ): Promise<TenantInstance> {
    const existing = this.instances.get(tenantId);
    if (existing) {
      // Generate temp workspace to sync content from
      const tempWorkspace = await this.workspaceService.generateWorkspace(workspaceConfig);
      try {
        await this.syncWorkspaceContent(tempWorkspace.path, existing.workspacePath);
      } finally {
        // Cleanup temp workspace after sync
        await tempWorkspace.cleanup();
      }
      this.logger.debug(`Reusing OpenCode instance for tenant ${tenantId}`);
      return existing;
    }

    // Generate workspace for new instance
    const workspace = await this.workspaceService.generateWorkspace(workspaceConfig);
    this.logger.log(`Creating new OpenCode instance for tenant ${tenantId}`);
    const port = await this.findAvailablePort();
    const originalCwd = process.cwd();

    try {
      process.chdir(workspace.path);
      const instance = await createOpencode({
        hostname: this.hostname,
        port,
        timeout: this.timeout,
      });

      const tenantInstance: TenantInstance = {
        instance,
        port,
        workspacePath: workspace.path,
        lastUsed: Date.now(),
        idleTimer: null,
      };

      this.instances.set(tenantId, tenantInstance);
      this.logger.log(`OpenCode for tenant ${tenantId} started on port ${port}`);

      return tenantInstance;
    } finally {
      process.chdir(originalCwd);
    }
  }

  /**
   * Sync workspace content (agents, tools, config) from new workspace to existing workspace
   */
  private async syncWorkspaceContent(
    sourcePath: string,
    targetPath: string,
  ): Promise<void> {
    // Sync .opencode directory (contains agents and tools)
    const sourceOpencode = path.join(sourcePath, ".opencode");
    const targetOpencode = path.join(targetPath, ".opencode");

    // Sync agents
    const sourceAgents = path.join(sourceOpencode, "agent");
    const targetAgents = path.join(targetOpencode, "agent");
    await this.syncDirectory(sourceAgents, targetAgents);

    // Sync tools
    const sourceTools = path.join(sourceOpencode, "tool");
    const targetTools = path.join(targetOpencode, "tool");
    await this.syncDirectory(sourceTools, targetTools);

    // Sync opencode.json
    const sourceConfig = path.join(sourcePath, "opencode.json");
    const targetConfig = path.join(targetPath, "opencode.json");
    try {
      const content = await fs.readFile(sourceConfig, "utf-8");
      await fs.writeFile(targetConfig, content, "utf-8");
    } catch {
      // Ignore if config doesn't exist
    }
  }

  /**
   * Sync directory contents, clearing target and copying source files
   */
  private async syncDirectory(sourcePath: string, targetPath: string): Promise<void> {
    try {
      // Clear target directory
      const existingFiles = await fs.readdir(targetPath).catch(() => []);
      for (const file of existingFiles) {
        await fs.rm(path.join(targetPath, file), { force: true });
      }

      // Copy source files
      const sourceFiles = await fs.readdir(sourcePath).catch(() => []);
      for (const file of sourceFiles) {
        const content = await fs.readFile(path.join(sourcePath, file), "utf-8");
        await fs.writeFile(path.join(targetPath, file), content, "utf-8");
      }
    } catch {
      // Ignore errors - directories may not exist
    }
  }

  /**
   * Update last used time and reset idle timer
   */
  private touchInstance(tenantId: string): void {
    const tenantInstance = this.instances.get(tenantId);
    if (!tenantInstance) return;

    tenantInstance.lastUsed = Date.now();

    // Clear existing timer
    if (tenantInstance.idleTimer) {
      clearTimeout(tenantInstance.idleTimer);
    }

    // Set new idle timer
    tenantInstance.idleTimer = setTimeout(() => {
      this.logger.log(
        `Tenant ${tenantId} idle for ${this.idleTimeoutMs / 1000}s, shutting down instance`,
      );
      this.shutdownInstance(tenantId);
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
