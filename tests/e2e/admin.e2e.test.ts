import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { httpRequest, TestClient } from "./setup.js";

describe("Admin API (e2e)", () => {
  let client: TestClient;
  let adminToken: string;

  beforeAll(() => {
    client = new TestClient();
    adminToken = client.adminToken;
  });

  describe("POST /v1/admin/tenants", () => {
    it("should reject request without admin token", async () => {
      const response = await httpRequest("POST", "/v1/admin/tenants", {
        body: { name: "Test Tenant" },
      });

      expect(response.status).toBe(401);
      expect((response.body as { message: string }).message).toContain(
        "Invalid or missing admin token",
      );
    });

    it("should reject request with invalid admin token", async () => {
      const response = await httpRequest("POST", "/v1/admin/tenants", {
        token: "wrong-token",
        body: { name: "Test Tenant" },
      });

      expect(response.status).toBe(401);
    });

    it("should create a new tenant", async () => {
      const response = await httpRequest("POST", "/v1/admin/tenants", {
        token: adminToken,
        body: { name: "Test Tenant" },
      });

      expect(response.status).toBe(201);
      const body = response.body as {
        tenant: { name: string; id: string; secrets?: unknown };
        token: string;
      };
      expect(body.tenant).toBeDefined();
      expect(body.tenant.name).toBe("Test Tenant");
      expect(body.tenant.id).toBeDefined();
      expect(body.token).toBeDefined();
      // Should not expose secrets
      expect(body.tenant.secrets).toBeUndefined();
    });
  });

  describe("GET /v1/admin/tenants", () => {
    it("should list all tenants", async () => {
      const response = await httpRequest("GET", "/v1/admin/tenants", {
        token: adminToken,
      });

      expect(response.status).toBe(200);
      const body = response.body as { tenants: unknown[] };
      expect(body.tenants).toBeDefined();
      expect(Array.isArray(body.tenants)).toBe(true);
      expect(body.tenants.length).toBeGreaterThan(0);
    });
  });

  describe("GET /v1/admin/tenants/:id", () => {
    let tenantId: string;

    beforeAll(async () => {
      const result = await client.createTenant("Tenant for GET test");
      tenantId = result.tenant.id;
    });

    afterAll(async () => {
      await client.deleteTenant(tenantId);
    });

    it("should get tenant by id", async () => {
      const response = await httpRequest("GET", `/v1/admin/tenants/${tenantId}`, {
        token: adminToken,
      });

      expect(response.status).toBe(200);
      const body = response.body as { tenant: { id: string; name: string; tokens: unknown } };
      expect(body.tenant.id).toBe(tenantId);
      expect(body.tenant.name).toBe("Tenant for GET test");
      expect(body.tenant.tokens).toBeDefined();
    });

    it("should return 404 for non-existent tenant", async () => {
      const response = await httpRequest("GET", "/v1/admin/tenants/non-existent-id", {
        token: adminToken,
      });

      expect(response.status).toBe(404);
      expect((response.body as { message: string }).message).toContain("not found");
    });
  });

  describe("DELETE /v1/admin/tenants/:id", () => {
    let tenantId: string;

    beforeAll(async () => {
      const result = await client.createTenant("Tenant for DELETE test");
      tenantId = result.tenant.id;
    });

    it("should delete a tenant", async () => {
      const response = await httpRequest("DELETE", `/v1/admin/tenants/${tenantId}`, {
        token: adminToken,
      });

      expect(response.status).toBe(204);

      // Verify tenant is deleted
      const getResponse = await httpRequest("GET", `/v1/admin/tenants/${tenantId}`, {
        token: adminToken,
      });

      expect(getResponse.status).toBe(404);
    });

    it("should return 404 when deleting non-existent tenant", async () => {
      const response = await httpRequest("DELETE", "/v1/admin/tenants/non-existent-id", {
        token: adminToken,
      });

      expect(response.status).toBe(404);
    });
  });
});
