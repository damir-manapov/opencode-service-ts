import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { httpRequest, TestClient } from "./setup.js";

describe("Models API (e2e)", () => {
  let client: TestClient;
  let tenantToken: string;
  let tenantId: string;

  beforeAll(async () => {
    client = new TestClient();
    const result = await client.createTenant("Models Test Tenant");
    tenantId = result.tenant.id;
    tenantToken = result.token;
  });

  afterAll(async () => {
    if (tenantId) {
      await client.deleteTenant(tenantId);
    }
  });

  describe("GET /v1/models", () => {
    it("should reject request without authentication", async () => {
      const response = await httpRequest("GET", "/v1/models");

      expect(response.status).toBe(401);
    });

    it("should reject request with invalid token", async () => {
      const response = await httpRequest("GET", "/v1/models", {
        token: "invalid-token",
      });

      expect(response.status).toBe(401);
    });

    it("should return models list with valid tenant token", async () => {
      const response = await httpRequest("GET", "/v1/models", {
        token: tenantToken,
      });

      expect(response.status).toBe(200);
      const body = response.body as { object: string; data: unknown[] };
      expect(body.object).toBe("list");
      expect(Array.isArray(body.data)).toBe(true);
    });

    it("should return OpenAI-compatible model format", async () => {
      const response = await httpRequest("GET", "/v1/models", {
        token: tenantToken,
      });

      expect(response.status).toBe(200);
      const body = response.body as {
        object: string;
        data: Array<{ id: string; object: string; owned_by: string }>;
      };

      if (body.data.length > 0) {
        const model = body.data[0]!;
        expect(model.id).toBeDefined();
        expect(model.object).toBe("model");
        expect(model.owned_by).toBeDefined();
      }
    });
  });
});
