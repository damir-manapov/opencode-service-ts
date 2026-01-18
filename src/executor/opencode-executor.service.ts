import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { createOpencode } from "@opencode-ai/sdk";
import type {
  ChatMessage,
  ExecutorResult,
  ModelSelection,
  StreamChunk,
} from "../chat/chat.types.js";
import { ConfigService } from "../config/config.service.js";
import type { GeneratedWorkspace } from "../workspace/workspace.types.js";

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
  workspace: GeneratedWorkspace;
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

  constructor(private readonly configService: ConfigService) {
    this.idleTimeoutMs = this.configService.get("idleTimeout");
    this.logger.log(`Idle timeout: ${this.idleTimeoutMs / 1000}s`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.shutdownAll();
  }

  /**
   * Execute OpenCode with the given workspace and messages
   * Uses per-tenant instance pooling with idle timeout
   */
  async execute(options: ExecuteOptions): Promise<ExecutorResult> {
    const { tenantId, workspace, messages, model, providerCredentials } = options;

    // Get or create instance for this tenant
    const tenantInstance = await this.getOrCreateInstance(tenantId, workspace.path);
    const client = tenantInstance.instance.client;

    // Update last used and reset idle timer
    this.touchInstance(tenantId);

    try {
      // Set provider credentials via OpenCode auth API
      if (providerCredentials) {
        await this.setProviderCredentials(client, providerCredentials, workspace.path);
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
              part?: { type?: string; tool?: string; metadata?: Record<string, unknown>; state?: string };
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
   */
  private async getOrCreateInstance(tenantId: string, workspacePath: string): Promise<TenantInstance> {
    const existing = this.instances.get(tenantId);
    if (existing) {
      this.logger.debug(`Reusing OpenCode instance for tenant ${tenantId}`);
      return existing;
    }

    this.logger.log(`Creating new OpenCode instance for tenant ${tenantId}`);
    const port = this.getNextPort();
    const originalCwd = process.cwd();

    try {
      process.chdir(workspacePath);
      const instance = await createOpencode({
        hostname: this.hostname,
        port,
        timeout: this.timeout,
      });

      const tenantInstance: TenantInstance = {
        instance,
        port,
        workspacePath,
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
      this.logger.log(`Tenant ${tenantId} idle for ${this.idleTimeoutMs / 1000}s, shutting down instance`);
      this.shutdownInstance(tenantId);
    }, this.idleTimeoutMs);
  }

  private getNextPort(): number {
    const port = this.nextPort++;
    if (this.nextPort > 15000) this.nextPort = 14096;
    return port;
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
