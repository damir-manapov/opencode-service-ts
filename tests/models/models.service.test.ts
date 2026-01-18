import { beforeEach, describe, expect, it, vi } from "vitest";
import { ModelsService } from "../../src/models/models.service.js";
import type { TenantService } from "../../src/tenant/tenant.service.js";
import type { TenantConfig } from "../../src/tenant/tenant.types.js";

describe("ModelsService", () => {
  let modelsService: ModelsService;
  let mockTenantService: { getTenant: ReturnType<typeof vi.fn> };

  const mockTenant: TenantConfig = {
    id: "test-tenant",
    name: "Test Tenant",
    tokens: ["test-token"],
    providers: {
      anthropic: { apiKey: "sk-ant-xxx" },
      openai: { apiKey: "sk-xxx" },
    },
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  };

  beforeEach(() => {
    mockTenantService = {
      getTenant: vi.fn().mockResolvedValue(mockTenant),
    };
    modelsService = new ModelsService(mockTenantService as unknown as TenantService);
  });

  describe("listModels", () => {
    it("should return models for configured providers", async () => {
      const result = await modelsService.listModels("test-tenant");

      expect(result.object).toBe("list");
      expect(result.data.length).toBeGreaterThan(0);

      // Should have anthropic models
      const anthropicModels = result.data.filter((m) => m.owned_by === "anthropic");
      expect(anthropicModels.length).toBeGreaterThan(0);
      expect(anthropicModels[0]?.id).toMatch(/^anthropic\//);

      // Should have openai models
      const openaiModels = result.data.filter((m) => m.owned_by === "openai");
      expect(openaiModels.length).toBeGreaterThan(0);
      expect(openaiModels[0]?.id).toMatch(/^openai\//);
    });

    it("should return empty list for unknown provider", async () => {
      mockTenantService.getTenant.mockResolvedValue({
        ...mockTenant,
        providers: { "unknown-provider": { apiKey: "xxx" } },
      });

      const result = await modelsService.listModels("test-tenant");

      expect(result.object).toBe("list");
      expect(result.data).toEqual([]);
    });

    it("should return model objects with correct shape", async () => {
      const result = await modelsService.listModels("test-tenant");

      for (const model of result.data) {
        expect(model).toHaveProperty("id");
        expect(model).toHaveProperty("object", "model");
        expect(model).toHaveProperty("created");
        expect(model).toHaveProperty("owned_by");
        expect(typeof model.created).toBe("number");
      }
    });
  });
});
