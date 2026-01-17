import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRepository, TenantRepository, ToolRepository } from "../../src/data/index.js";
import { TenantService } from "../../src/tenant/tenant.service.js";
import type { TenantConfig } from "../../src/tenant/tenant.types.js";

describe("TenantService", () => {
  let service: TenantService;
  let tenantRepo: TenantRepository;
  let toolRepo: ToolRepository;
  let agentRepo: AgentRepository;

  beforeEach(() => {
    tenantRepo = {
      get: vi.fn(),
      list: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
    };
    toolRepo = {
      list: vi.fn(),
      get: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
    };
    agentRepo = {
      list: vi.fn(),
      get: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
    };
    service = new TenantService(tenantRepo, toolRepo, agentRepo);
  });

  describe("createTenant", () => {
    it("should create tenant with generated id and token", async () => {
      const input = {
        name: "Test Tenant",
        providers: { anthropic: { apiKey: "test-key" } },
      };

      const result = await service.createTenant(input);

      expect(result.tenant.name).toBe("Test Tenant");
      expect(result.tenant.id).toMatch(/^[a-f0-9]{16}$/);
      expect(result.token).toMatch(/^ocs_[a-f0-9]{16}_sk_[a-f0-9]{32}$/);
      expect(result.tenant.tokens).toContain(result.token);
      expect(result.tenant.providers).toEqual({ anthropic: { apiKey: "test-key" } });
      expect(tenantRepo.save).toHaveBeenCalledWith(result.tenant);
    });

    it("should set timestamps", async () => {
      const input = {
        name: "Test",
        providers: {},
      };

      const result = await service.createTenant(input);

      expect(result.tenant.createdAt).toBeDefined();
      expect(result.tenant.updatedAt).toBeDefined();
      expect(result.tenant.createdAt).toBe(result.tenant.updatedAt);
    });
  });

  describe("getTenant", () => {
    it("should delegate to repository", async () => {
      const tenant: TenantConfig = {
        id: "test-id",
        name: "Test",
        tokens: [],
        providers: {},
        createdAt: "2025-01-01",
        updatedAt: "2025-01-01",
      };
      vi.mocked(tenantRepo.get).mockResolvedValue(tenant);

      const result = await service.getTenant("test-id");

      expect(result).toBe(tenant);
      expect(tenantRepo.get).toHaveBeenCalledWith("test-id");
    });
  });

  describe("updateTenant", () => {
    it("should update and save tenant", async () => {
      const existing: TenantConfig = {
        id: "test-id",
        name: "Old Name",
        tokens: ["token1"],
        providers: {},
        createdAt: "2025-01-01",
        updatedAt: "2025-01-01",
      };
      vi.mocked(tenantRepo.get).mockResolvedValue(existing);

      const result = await service.updateTenant("test-id", { name: "New Name" });

      expect(result?.name).toBe("New Name");
      expect(result?.id).toBe("test-id");
      expect(tenantRepo.save).toHaveBeenCalled();
    });

    it("should prevent id change", async () => {
      const existing: TenantConfig = {
        id: "test-id",
        name: "Test",
        tokens: [],
        providers: {},
        createdAt: "2025-01-01",
        updatedAt: "2025-01-01",
      };
      vi.mocked(tenantRepo.get).mockResolvedValue(existing);

      const result = await service.updateTenant("test-id", {
        id: "hacked-id",
      } as Partial<TenantConfig>);

      expect(result?.id).toBe("test-id");
    });

    it("should return null if tenant not found", async () => {
      vi.mocked(tenantRepo.get).mockResolvedValue(null);

      const result = await service.updateTenant("nonexistent", { name: "New" });

      expect(result).toBeNull();
    });
  });

  describe("deleteTenant", () => {
    it("should delegate to repository", async () => {
      vi.mocked(tenantRepo.delete).mockResolvedValue(true);

      const result = await service.deleteTenant("test-id");

      expect(result).toBe(true);
      expect(tenantRepo.delete).toHaveBeenCalledWith("test-id");
    });
  });

  describe("addToken", () => {
    it("should add new token to tenant", async () => {
      const existing: TenantConfig = {
        id: "test-id",
        name: "Test",
        tokens: ["existing-token"],
        providers: {},
        createdAt: "2025-01-01",
        updatedAt: "2025-01-01",
      };
      vi.mocked(tenantRepo.get).mockResolvedValue(existing);

      const newToken = await service.addToken("test-id");

      expect(newToken).toMatch(/^ocs_test-id_sk_/);
      expect(tenantRepo.save).toHaveBeenCalled();
    });

    it("should return null if tenant not found", async () => {
      vi.mocked(tenantRepo.get).mockResolvedValue(null);

      const result = await service.addToken("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("revokeToken", () => {
    it("should remove token from tenant", async () => {
      const existing: TenantConfig = {
        id: "test-id",
        name: "Test",
        tokens: ["token1", "token2"],
        providers: {},
        createdAt: "2025-01-01",
        updatedAt: "2025-01-01",
      };
      vi.mocked(tenantRepo.get).mockResolvedValue(existing);

      const result = await service.revokeToken("test-id", "token1");

      expect(result).toBe(true);
      expect(tenantRepo.save).toHaveBeenCalled();
    });

    it("should return false if token not found", async () => {
      const existing: TenantConfig = {
        id: "test-id",
        name: "Test",
        tokens: ["token1"],
        providers: {},
        createdAt: "2025-01-01",
        updatedAt: "2025-01-01",
      };
      vi.mocked(tenantRepo.get).mockResolvedValue(existing);

      const result = await service.revokeToken("test-id", "nonexistent");

      expect(result).toBe(false);
    });
  });

  describe("tools", () => {
    it("should delegate listTools to repository", async () => {
      vi.mocked(toolRepo.list).mockResolvedValue(["tool1", "tool2"]);

      const result = await service.listTools("tenant-id");

      expect(result).toEqual(["tool1", "tool2"]);
      expect(toolRepo.list).toHaveBeenCalledWith("tenant-id");
    });

    it("should delegate getTool to repository", async () => {
      vi.mocked(toolRepo.get).mockResolvedValue("tool content");

      const result = await service.getTool("tenant-id", "my-tool");

      expect(result).toBe("tool content");
      expect(toolRepo.get).toHaveBeenCalledWith("tenant-id", "my-tool");
    });

    it("should delegate saveTool to repository", async () => {
      await service.saveTool("tenant-id", "my-tool", "content");

      expect(toolRepo.save).toHaveBeenCalledWith("tenant-id", "my-tool", "content");
    });

    it("should delegate deleteTool to repository", async () => {
      vi.mocked(toolRepo.delete).mockResolvedValue(true);

      const result = await service.deleteTool("tenant-id", "my-tool");

      expect(result).toBe(true);
      expect(toolRepo.delete).toHaveBeenCalledWith("tenant-id", "my-tool");
    });
  });

  describe("agents", () => {
    it("should delegate listAgents to repository", async () => {
      vi.mocked(agentRepo.list).mockResolvedValue(["agent1"]);

      const result = await service.listAgents("tenant-id");

      expect(result).toEqual(["agent1"]);
    });

    it("should delegate getAgent to repository", async () => {
      vi.mocked(agentRepo.get).mockResolvedValue("agent content");

      const result = await service.getAgent("tenant-id", "my-agent");

      expect(result).toBe("agent content");
    });

    it("should delegate saveAgent to repository", async () => {
      await service.saveAgent("tenant-id", "my-agent", "content");

      expect(agentRepo.save).toHaveBeenCalledWith("tenant-id", "my-agent", "content");
    });

    it("should delegate deleteAgent to repository", async () => {
      vi.mocked(agentRepo.delete).mockResolvedValue(true);

      const result = await service.deleteAgent("tenant-id", "my-agent");

      expect(result).toBe(true);
    });
  });

  describe("secrets", () => {
    it("should set secret on tenant", async () => {
      const existing: TenantConfig = {
        id: "test-id",
        name: "Test",
        tokens: [],
        providers: {},
        secrets: {},
        createdAt: "2025-01-01",
        updatedAt: "2025-01-01",
      };
      vi.mocked(tenantRepo.get).mockResolvedValue(existing);

      await service.setSecret("test-id", "API_KEY", "secret-value");

      expect(tenantRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          secrets: { API_KEY: "secret-value" },
        }),
      );
    });

    it("should delete secret from tenant", async () => {
      const existing: TenantConfig = {
        id: "test-id",
        name: "Test",
        tokens: [],
        providers: {},
        secrets: { API_KEY: "value" },
        createdAt: "2025-01-01",
        updatedAt: "2025-01-01",
      };
      vi.mocked(tenantRepo.get).mockResolvedValue(existing);

      const result = await service.deleteSecret("test-id", "API_KEY");

      expect(result).toBe(true);
      expect(tenantRepo.save).toHaveBeenCalled();
    });

    it("should return false when deleting nonexistent secret", async () => {
      const existing: TenantConfig = {
        id: "test-id",
        name: "Test",
        tokens: [],
        providers: {},
        secrets: {},
        createdAt: "2025-01-01",
        updatedAt: "2025-01-01",
      };
      vi.mocked(tenantRepo.get).mockResolvedValue(existing);

      const result = await service.deleteSecret("test-id", "NONEXISTENT");

      expect(result).toBe(false);
    });
  });
});
