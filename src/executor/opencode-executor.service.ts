import { Injectable, Logger } from "@nestjs/common";
import { createOpencode } from "@opencode-ai/sdk";
import type {
  ChatMessage,
  ExecutorResult,
  ModelSelection,
  StreamChunk,
} from "../chat/chat.types.js";
import type { GeneratedWorkspace } from "../workspace/workspace.types.js";

type OpencodeInstance = Awaited<ReturnType<typeof createOpencode>>;
type OpencodeClient = OpencodeInstance["client"];

export interface ExecuteOptions {
  workspace: GeneratedWorkspace;
  messages: ChatMessage[];
  model?: ModelSelection;
  /** Provider credentials in format { providerId: apiKey } */
  providerCredentials?: Record<string, string>;
}

@Injectable()
export class OpencodeExecutorService {
  private readonly logger = new Logger(OpencodeExecutorService.name);
  private readonly hostname = "127.0.0.1";
  private readonly timeout = 30000;
  private nextPort = 14096;

  /**
   * Execute OpenCode with the given workspace and messages
   * Returns the full response (non-streaming)
   */
  async execute(options: ExecuteOptions): Promise<ExecutorResult> {
    const { workspace, messages, model, providerCredentials } = options;

    // Start a fresh OpenCode instance in the workspace directory for tenant isolation
    const instance = await this.startFreshInstance(workspace.path);
    const client = instance.client;

    try {
      // Set provider credentials via OpenCode auth API
      if (providerCredentials) {
        await this.setProviderCredentials(client, providerCredentials, workspace.path);
      }

      const prompt = this.buildPrompt(messages);
      const providerID = model?.providerId ?? "anthropic";
      const modelID = model?.modelId ?? "claude-sonnet-4-20250514";

      this.logger.log(`Executing: ${providerID}/${modelID} in ${workspace.path}`);

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
    } finally {
      instance.server.close();
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
   * Start a fresh OpenCode instance in a specific workspace directory
   */
  private async startFreshInstance(workspacePath: string): Promise<OpencodeInstance> {
    const port = this.getNextPort();
    const originalCwd = process.cwd();

    try {
      process.chdir(workspacePath);
      return await createOpencode({
        hostname: this.hostname,
        port,
        timeout: this.timeout,
      });
    } finally {
      process.chdir(originalCwd);
    }
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
