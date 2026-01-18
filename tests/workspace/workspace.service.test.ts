import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorkspaceService } from "../../src/workspace/workspace.service.js";
import type { WorkspaceConfig } from "../../src/workspace/workspace.types.js";

describe("WorkspaceService", () => {
  let service: WorkspaceService;
  let cleanupPaths: string[] = [];

  beforeEach(() => {
    service = new WorkspaceService();
    cleanupPaths = [];
  });

  afterEach(async () => {
    // Cleanup any created workspaces
    for (const p of cleanupPaths) {
      await fs.rm(p, { recursive: true, force: true });
    }
  });

  describe("generateWorkspace", () => {
    it("should create workspace directory structure", async () => {
      const config: WorkspaceConfig = {
        tenantId: "test-tenant",
        providers: {},
        tools: [],
        agents: [],
        secrets: {},
      };

      const workspace = await service.generateWorkspace(config);
      cleanupPaths.push(workspace.path);

      // Check directories exist
      const toolDir = path.join(workspace.path, ".opencode", "tool");
      const agentDir = path.join(workspace.path, ".opencode", "agent");

      const toolStat = await fs.stat(toolDir);
      const agentStat = await fs.stat(agentDir);

      expect(toolStat.isDirectory()).toBe(true);
      expect(agentStat.isDirectory()).toBe(true);
    });

    it("should write tools to workspace", async () => {
      const config: WorkspaceConfig = {
        tenantId: "test-tenant",
        providers: {},
        tools: [
          { name: "my-tool", source: 'export default { name: "my-tool" };' },
          { name: "other-tool", source: 'export default { name: "other-tool" };' },
        ],
        agents: [],
        secrets: {},
      };

      const workspace = await service.generateWorkspace(config);
      cleanupPaths.push(workspace.path);

      const tool1Path = path.join(workspace.path, ".opencode", "tool", "my-tool.ts");
      const tool2Path = path.join(workspace.path, ".opencode", "tool", "other-tool.ts");

      const tool1Content = await fs.readFile(tool1Path, "utf-8");
      const tool2Content = await fs.readFile(tool2Path, "utf-8");

      expect(tool1Content).toBe('export default { name: "my-tool" };');
      expect(tool2Content).toBe('export default { name: "other-tool" };');
    });

    it("should write agents to workspace", async () => {
      const config: WorkspaceConfig = {
        tenantId: "test-tenant",
        providers: {},
        tools: [],
        agents: [{ name: "default", content: "# Default Agent\n\nYou are a helpful assistant." }],
        secrets: {},
      };

      const workspace = await service.generateWorkspace(config);
      cleanupPaths.push(workspace.path);

      const agentPath = path.join(workspace.path, ".opencode", "agent", "default.md");
      const agentContent = await fs.readFile(agentPath, "utf-8");

      expect(agentContent).toBe("# Default Agent\n\nYou are a helpful assistant.");
    });

    it("should generate opencode.json with providers", async () => {
      const config: WorkspaceConfig = {
        tenantId: "test-tenant",
        providers: {
          anthropic: { apiKey: "sk-ant-xxx" },
          openai: { apiKey: "sk-xxx" },
        },
        tools: [],
        agents: [],
        secrets: {},
      };

      const workspace = await service.generateWorkspace(config);
      cleanupPaths.push(workspace.path);

      const configPath = path.join(workspace.path, "opencode.json");
      const configContent = await fs.readFile(configPath, "utf-8");
      const parsedConfig = JSON.parse(configContent);

      // Provider entries exist but don't contain apiKey (credentials set via auth API)
      expect(parsedConfig.provider).toEqual({
        anthropic: {},
        openai: {},
      });
    });

    it("should generate opencode.json with default model", async () => {
      const config: WorkspaceConfig = {
        tenantId: "test-tenant",
        providers: {},
        defaultModel: { providerId: "anthropic", modelId: "claude-sonnet" },
        tools: [],
        agents: [],
        secrets: {},
      };

      const workspace = await service.generateWorkspace(config);
      cleanupPaths.push(workspace.path);

      const configPath = path.join(workspace.path, "opencode.json");
      const configContent = await fs.readFile(configPath, "utf-8");
      const parsedConfig = JSON.parse(configContent);

      // Model is a simple string, not an object
      expect(parsedConfig.model).toBe("anthropic/claude-sonnet");
    });

    it("should prefer request model over default model", async () => {
      const config: WorkspaceConfig = {
        tenantId: "test-tenant",
        providers: {},
        defaultModel: { providerId: "anthropic", modelId: "claude-sonnet" },
        requestModel: { providerId: "openai", modelId: "gpt-4" },
        tools: [],
        agents: [],
        secrets: {},
      };

      const workspace = await service.generateWorkspace(config);
      cleanupPaths.push(workspace.path);

      const configPath = path.join(workspace.path, "opencode.json");
      const configContent = await fs.readFile(configPath, "utf-8");
      const parsedConfig = JSON.parse(configContent);

      // Model is a simple string, not an object
      expect(parsedConfig.model).toBe("openai/gpt-4");
    });

    it("cleanup should remove workspace", async () => {
      const config: WorkspaceConfig = {
        tenantId: "test-tenant",
        providers: {},
        tools: [],
        agents: [],
        secrets: {},
      };

      const workspace = await service.generateWorkspace(config);
      const workspacePath = workspace.path;

      // Verify it exists
      const exists1 = await fs
        .stat(workspacePath)
        .then(() => true)
        .catch(() => false);
      expect(exists1).toBe(true);

      // Cleanup
      await workspace.cleanup();

      // Verify it's gone
      const exists2 = await fs
        .stat(workspacePath)
        .then(() => true)
        .catch(() => false);
      expect(exists2).toBe(false);
    });
  });
});
