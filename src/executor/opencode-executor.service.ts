import { type ChildProcess, spawn } from "node:child_process";
import { Injectable, Logger } from "@nestjs/common";
import type { ChatMessage, StreamChunk } from "../chat/chat.types.js";
import type { GeneratedWorkspace } from "../workspace/workspace.types.js";

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

@Injectable()
export class OpencodeExecutorService {
  private readonly logger = new Logger(OpencodeExecutorService.name);

  /**
   * Execute OpenCode with the given workspace and messages
   * Returns the full response (non-streaming)
   */
  async execute(options: ExecuteOptions): Promise<ExecuteResult> {
    const { workspace, messages, environment } = options;

    // Build the prompt from messages
    const prompt = this.buildPrompt(messages);

    // Execute opencode CLI
    const result = await this.runOpencode(workspace.path, prompt, environment);

    return result;
  }

  /**
   * Execute OpenCode with streaming response
   */
  async *executeStreaming(options: ExecuteOptions): AsyncGenerator<StreamChunk, void, undefined> {
    const { workspace, messages, environment } = options;

    const prompt = this.buildPrompt(messages);

    // For now, we'll execute and yield the result as a single chunk
    // TODO: Implement proper streaming when OpenCode SDK supports it
    const result = await this.runOpencode(workspace.path, prompt, environment);

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

  private buildPrompt(messages: ChatMessage[]): string {
    // Build a single prompt string from messages
    // The last user message is the main prompt
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
   * Run opencode CLI in the workspace directory
   */
  private async runOpencode(
    workspacePath: string,
    prompt: string,
    environment: Record<string, string>,
  ): Promise<ExecuteResult> {
    return new Promise((resolve, reject) => {
      const args = ["--prompt", prompt, "--non-interactive"];

      this.logger.debug(`Running opencode in ${workspacePath}`);
      this.logger.debug(`Prompt: ${prompt.slice(0, 100)}...`);

      const child: ChildProcess = spawn("opencode", args, {
        cwd: workspacePath,
        env: environment,
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        if (code !== 0) {
          this.logger.error(`OpenCode exited with code ${code}: ${stderr}`);
          reject(new Error(`OpenCode execution failed: ${stderr || "Unknown error"}`));
          return;
        }

        // Parse the output
        const result = this.parseOutput(stdout);
        resolve(result);
      });

      child.on("error", (err) => {
        this.logger.error(`Failed to start OpenCode: ${err.message}`);
        reject(new Error(`Failed to start OpenCode: ${err.message}`));
      });
    });
  }

  /**
   * Parse OpenCode CLI output
   * TODO: Implement proper parsing based on OpenCode output format
   */
  private parseOutput(output: string): ExecuteResult {
    // For now, return the raw output as content
    // TODO: Parse tool calls from output
    return {
      content: output.trim(),
      toolCalls: [],
    };
  }
}
