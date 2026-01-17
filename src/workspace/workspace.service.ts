import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Injectable } from "@nestjs/common";
import type { GeneratedWorkspace, OpencodeJsonConfig, WorkspaceConfig } from "./workspace.types.js";

@Injectable()
export class WorkspaceService {
  /**
   * Generate a temporary workspace with OpenCode configuration
   */
  async generateWorkspace(config: WorkspaceConfig): Promise<GeneratedWorkspace> {
    const workspaceId = config.sessionId ?? randomUUID();
    const workspacePath = path.join(os.tmpdir(), "opencode-workspaces", workspaceId);

    // Create workspace directories
    await fs.mkdir(path.join(workspacePath, ".opencode", "tool"), { recursive: true });
    await fs.mkdir(path.join(workspacePath, ".opencode", "agent"), { recursive: true });

    // Write tools
    for (const tool of config.tools) {
      const toolPath = path.join(workspacePath, ".opencode", "tool", `${tool.name}.ts`);
      await fs.writeFile(toolPath, tool.source, "utf-8");
    }

    // Write agents
    for (const agent of config.agents) {
      const agentPath = path.join(workspacePath, ".opencode", "agent", `${agent.name}.md`);
      await fs.writeFile(agentPath, agent.content, "utf-8");
    }

    // Generate opencode.json
    const opencodeConfig = this.generateOpencodeConfig(config);
    await fs.writeFile(
      path.join(workspacePath, "opencode.json"),
      JSON.stringify(opencodeConfig, null, 2),
      "utf-8",
    );

    return {
      path: workspacePath,
      cleanup: async () => {
        // Only cleanup if not a persistent session
        if (!config.sessionId) {
          await fs.rm(workspacePath, { recursive: true, force: true });
        }
      },
    };
  }

  /**
   * Generate opencode.json configuration
   */
  private generateOpencodeConfig(config: WorkspaceConfig): OpencodeJsonConfig {
    const opencodeConfig: OpencodeJsonConfig = {};

    // Add providers
    if (Object.keys(config.providers).length > 0) {
      opencodeConfig.provider = {};
      for (const [providerId, providerConfig] of Object.entries(config.providers)) {
        opencodeConfig.provider[providerId] = {
          apiKey: providerConfig.apiKey,
        };
      }
    }

    // Set default model
    const model = config.requestModel ?? config.defaultModel;
    if (model) {
      opencodeConfig.model = {
        default: `${model.providerId}/${model.modelId}`,
      };
    }

    return opencodeConfig;
  }

  /**
   * Build environment variables for OpenCode execution
   */
  buildEnvironment(secrets: Record<string, string>): Record<string, string> {
    const env: Record<string, string> = {};

    // Copy relevant environment variables
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        env[key] = value;
      }
    }

    // Inject tenant secrets (override any existing)
    for (const [key, value] of Object.entries(secrets)) {
      env[key] = value;
    }

    return env;
  }
}
