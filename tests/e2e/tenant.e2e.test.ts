import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { httpRequest, TestClient } from "./setup.js";

describe("Tenant API (e2e)", () => {
  let client: TestClient;
  let tenantToken: string;
  let tenantId: string;
  let tenantName: string;

  beforeAll(async () => {
    client = new TestClient();

    // Create a tenant for testing
    const result = await client.createTenant("E2E Test Tenant", {
      providers: { openai: { apiKey: "test-key" } },
    });

    tenantId = result.tenant.id;
    tenantName = result.tenant.name;
    tenantToken = result.token;
  });

  afterAll(async () => {
    await client.deleteTenant(tenantId);
  });

  describe("Authentication", () => {
    it("should reject request without token", async () => {
      const response = await httpRequest("GET", "/v1/tenant/config");

      expect(response.status).toBe(401);
    });

    it("should reject request with invalid token", async () => {
      const response = await httpRequest("GET", "/v1/tenant/config", {
        token: "invalid-token",
      });

      expect(response.status).toBe(401);
    });
  });

  describe("GET /v1/tenant/config", () => {
    it("should return tenant config", async () => {
      const response = await httpRequest("GET", "/v1/tenant/config", {
        token: tenantToken,
      });

      expect(response.status).toBe(200);
      const body = response.body as {
        id: string;
        name: string;
        providers: { openai: { configured: boolean } };
      };
      expect(body.id).toBe(tenantId);
      expect(body.name).toBe(tenantName);
      expect(body.providers.openai).toBeDefined();
      expect(body.providers.openai.configured).toBe(true);
    });
  });

  describe("PUT /v1/tenant/config", () => {
    it("should update tenant config", async () => {
      const response = await httpRequest("PUT", "/v1/tenant/config", {
        token: tenantToken,
        body: { name: "Updated Tenant Name" },
      });

      expect(response.status).toBe(200);
      expect((response.body as { name: string }).name).toBe("Updated Tenant Name");
    });
  });

  describe("Tools CRUD", () => {
    const toolName = "my-tool";
    const toolContent = "console.log('tool');";

    it("should list tools (empty initially)", async () => {
      const response = await httpRequest("GET", "/v1/tenant/tools", {
        token: tenantToken,
      });

      expect(response.status).toBe(200);
      expect((response.body as { tools: string[] }).tools).toEqual([]);
    });

    it("should create a tool", async () => {
      const response = await httpRequest("PUT", `/v1/tenant/tools/${toolName}`, {
        token: tenantToken,
        contentType: "text/plain",
        body: toolContent,
      });

      expect(response.status).toBe(200);
      expect((response.body as { name: string }).name).toBe(toolName);
    });

    it("should reject invalid tool name", async () => {
      const response = await httpRequest("PUT", "/v1/tenant/tools/Invalid_Name", {
        token: tenantToken,
        contentType: "text/plain",
        body: "content",
      });

      expect(response.status).toBe(400);
      expect((response.body as { message: string }).message).toContain("lowercase alphanumeric");
    });

    it("should get a tool", async () => {
      const response = await httpRequest("GET", `/v1/tenant/tools/${toolName}`, {
        token: tenantToken,
      });

      expect(response.status).toBe(200);
      expect(response.text).toBe(toolContent);
    });

    it("should return 404 for non-existent tool", async () => {
      const response = await httpRequest("GET", "/v1/tenant/tools/non-existent", {
        token: tenantToken,
      });

      expect(response.status).toBe(404);
    });

    it("should list tools (after creation)", async () => {
      const response = await httpRequest("GET", "/v1/tenant/tools", {
        token: tenantToken,
      });

      expect(response.status).toBe(200);
      expect((response.body as { tools: string[] }).tools).toContain(toolName);
    });

    it("should delete a tool", async () => {
      const response = await httpRequest("DELETE", `/v1/tenant/tools/${toolName}`, {
        token: tenantToken,
      });

      expect(response.status).toBe(204);

      // Verify deletion
      const getResponse = await httpRequest("GET", `/v1/tenant/tools/${toolName}`, {
        token: tenantToken,
      });

      expect(getResponse.status).toBe(404);
    });
  });

  describe("Agents CRUD", () => {
    const agentName = "my-agent";
    const agentContent = "You are a helpful assistant.";

    it("should list agents (empty initially)", async () => {
      const response = await httpRequest("GET", "/v1/tenant/agents", {
        token: tenantToken,
      });

      expect(response.status).toBe(200);
      expect((response.body as { agents: string[] }).agents).toEqual([]);
    });

    it("should create an agent", async () => {
      const response = await httpRequest("PUT", `/v1/tenant/agents/${agentName}`, {
        token: tenantToken,
        contentType: "text/plain",
        body: agentContent,
      });

      expect(response.status).toBe(200);
      expect((response.body as { name: string }).name).toBe(agentName);
    });

    it("should reject invalid agent name", async () => {
      const response = await httpRequest("PUT", "/v1/tenant/agents/Invalid_Name", {
        token: tenantToken,
        contentType: "text/plain",
        body: "content",
      });

      expect(response.status).toBe(400);
    });

    it("should get an agent", async () => {
      const response = await httpRequest("GET", `/v1/tenant/agents/${agentName}`, {
        token: tenantToken,
      });

      expect(response.status).toBe(200);
      expect(response.text).toBe(agentContent);
    });

    it("should delete an agent", async () => {
      const response = await httpRequest("DELETE", `/v1/tenant/agents/${agentName}`, {
        token: tenantToken,
      });

      expect(response.status).toBe(204);
    });
  });

  describe("Secrets CRUD", () => {
    const secretName = "API_KEY";
    const secretValue = "secret-value-123";

    it("should list secrets (empty initially)", async () => {
      const response = await httpRequest("GET", "/v1/tenant/secrets", {
        token: tenantToken,
      });

      expect(response.status).toBe(200);
      expect((response.body as { secrets: string[] }).secrets).toEqual([]);
    });

    it("should create a secret", async () => {
      const response = await httpRequest("PUT", `/v1/tenant/secrets/${secretName}`, {
        token: tenantToken,
        body: { value: secretValue },
      });

      expect(response.status).toBe(200);
      expect((response.body as { name: string }).name).toBe(secretName);
    });

    it("should reject invalid secret name", async () => {
      const response = await httpRequest("PUT", "/v1/tenant/secrets/invalid-name", {
        token: tenantToken,
        body: { value: "test" },
      });

      expect(response.status).toBe(400);
      expect((response.body as { message: string }).message).toContain("uppercase alphanumeric");
    });

    it("should list secrets (after creation)", async () => {
      const response = await httpRequest("GET", "/v1/tenant/secrets", {
        token: tenantToken,
      });

      expect(response.status).toBe(200);
      expect((response.body as { secrets: string[] }).secrets).toContain(secretName);
    });

    it("should delete a secret", async () => {
      const response = await httpRequest("DELETE", `/v1/tenant/secrets/${secretName}`, {
        token: tenantToken,
      });

      expect(response.status).toBe(204);
    });

    it("should return 404 when deleting non-existent secret", async () => {
      const response = await httpRequest("DELETE", "/v1/tenant/secrets/NON_EXISTENT", {
        token: tenantToken,
      });

      expect(response.status).toBe(404);
    });
  });
});
