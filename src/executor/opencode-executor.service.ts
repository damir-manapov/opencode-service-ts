import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { createOpencode, createOpencodeClient } from "@opencode-ai/sdk";
import type { ChatMessage, StreamChunk } from "../chat/chat.types.js";
import type { GeneratedWorkspace } from "../workspace/workspace.types.js";

type OpencodeClient = Awaited<ReturnType<typeof createOpencodeClient>>;
type OpencodeInstance = Awaited<ReturnType<typeof createOpencode>>;

export interface ExecuteOptions {
  workspace: GeneratedWorkspace;
  messages: ChatMessage[];
  environment: Record<string, string>;
  model?: { providerId: string; modelId: string };
}

export interface ExecuteResult {
  content: string;
  toolCalls: Array<{
    name: string;
    input: unknown;
    output: unknown;
  }>;
}

/**
 * Check if OpenCode server is running at the given URL
 */
async function isServerRunning(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/global/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

@Injectable()
export class OpencodeExecutorService implements OnModuleDestroy {
  private readonly logger = new Logger(OpencodeExecutorService.name);
  private client: OpencodeClient | null = null;
  private instance: OpencodeInstance | null = null;
  private initPromise: Promise<OpencodeClient> | null = null;

  private readonly hostname = "127.0.0.1";
  private readonly port = 4096;
  private readonly timeout = 30000;

  async onModuleDestroy(): Promise<void> {
    this.dispose();
  }

  /**
   * Execute OpenCode with the given workspace and messages
   * Returns the full response (non-streaming)
   */
  async execute(options: ExecuteOptions): Promise<ExecuteResult> {
    const { workspace, messages, environment, model } = options;

    // Inject environment variables for provider credentials
    this.injectEnvironment(environment);

    const client = await this.getClient(workspace.path);
    const prompt = this.buildPrompt(messages);

    // Parse model
    const providerID = model?.providerId ?? "anthropic";
    const modelID = model?.modelId ?? "claude-sonnet-4-20250514";

    this.logger.debug(`Executing prompt in workspace: ${workspace.path}`);
    this.logger.debug(`Model: ${providerID}/${modelID}`);

    // Create a temporary session for this request with workspace directory
    const createResponse = await client.session.create({
      query: {
        directory: workspace.path,
      },
      body: {
        title: "OpenCode Service Request",
      },
    });

    if (!createResponse.data) {
      throw new Error("Failed to create OpenCode session");
    }

    const session = createResponse.data;

    try {
      // Execute with OpenCode - tools are available from workspace/.opencode/tool/
      const response = await client.session.prompt({
        path: { id: session.id },
        body: {
          model: { providerID, modelID },
          parts: [{ type: "text", text: prompt }],
        },
      });

      if (!response.data) {
        throw new Error("No response from OpenCode");
      }

      // Collect all text parts and tool calls from response
      const textParts: string[] = [];
      const toolCalls: ExecuteResult["toolCalls"] = [];

      for (const part of response.data.parts) {
        if (part.type === "text") {
          textParts.push(part.text);
        } else if (part.type === "tool") {
          toolCalls.push({
            name: part.tool,
            input: part.metadata ?? {},
            output: part.state,
          });
        }
      }

      return {
        content: textParts.join("\n") || "No response generated",
        toolCalls,
      };
    } finally {
      // Clean up session
      await client.session.delete({ path: { id: session.id } }).catch(() => {
        // Ignore cleanup errors
      });
    }
  }

  /**
   * Execute OpenCode with streaming response
   */
  async *executeStreaming(options: ExecuteOptions): AsyncGenerator<StreamChunk, void, undefined> {
    // For now, execute fully and yield chunks
    // TODO: Implement proper streaming with SDK event subscription
    const result = await this.execute(options);

    // Yield tool calls first
    for (const toolCall of result.toolCalls) {
      yield {
        type: "tool_call",
        toolCall,
      };
    }

    // Yield the final text
    yield {
      type: "text",
      content: result.content,
    };

    yield { type: "done" };
  }

  private async getClient(_workspacePath: string): Promise<OpencodeClient> {
    if (this.client) {
      return this.client;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.initializeClient();
    try {
      this.client = await this.initPromise;
      return this.client;
    } finally {
      this.initPromise = null;
    }
  }

  private async initializeClient(): Promise<OpencodeClient> {
    const baseUrl = `http://${this.hostname}:${this.port}`;

    // Check if server is already running
    const isRunning = await isServerRunning(baseUrl);

    if (isRunning) {
      this.logger.log("Connecting to existing OpenCode server");
      return createOpencodeClient({ baseUrl });
    }

    this.logger.log("Starting new OpenCode server");

    // Start new server
    this.instance = await createOpencode({
      hostname: this.hostname,
      port: this.port,
      timeout: this.timeout,
    });

    return this.instance.client;
  }

  private buildPrompt(messages: ChatMessage[]): string {
    const parts: string[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        parts.push(`System: ${msg.content}`);
      } else if (msg.role === "user") {
        parts.push(`User: ${msg.content}`);
      } else if (msg.role === "assistant") {
        parts.push(`Assistant: ${msg.content}`);
      }
    }

    return parts.join("\n\n");
  }

  /**
   * Inject environment variables for provider credentials
   */
  private injectEnvironment(env: Record<string, string>): void {
    for (const [key, value] of Object.entries(env)) {
      process.env[key] = value;
    }
  }

  dispose(): void {
    if (this.instance?.server) {
      this.logger.log("Shutting down OpenCode server");
      this.instance.server.close();
    }
    this.client = null;
    this.instance = null;
    this.initPromise = null;
  }
}
