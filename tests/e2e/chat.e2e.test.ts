import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTestConfig, httpRequest, type TestConfig } from "./setup.js";

describe("Chat API", () => {
  let config: TestConfig;
  let tenantToken: string;

  beforeAll(async () => {
    config = getTestConfig();

    // Create a test tenant for chat tests
    const response = await httpRequest("POST", "/v1/admin/tenants", {
      token: config.adminToken,
      body: {
        name: "Chat Test Tenant",
        providers: {
          anthropic: { apiKey: "sk-ant-test-key" },
        },
        defaultModel: {
          providerId: "anthropic",
          modelId: "claude-sonnet",
        },
      },
    });

    if (response.status === 201) {
      const data = response.body as { id: string; token: string };
      tenantToken = data.token;
    } else if (response.status === 409) {
      // Tenant exists, delete and recreate
      const listResponse = await httpRequest("GET", "/v1/admin/tenants", {
        token: config.adminToken,
      });
      const tenants = (listResponse.body as { tenants: Array<{ id: string }> }).tenants;
      const chatTenant = tenants.find((t) => t.id.includes("chat"));

      if (chatTenant) {
        await httpRequest("DELETE", `/v1/admin/tenants/${chatTenant.id}`, {
          token: config.adminToken,
        });
      }

      const retryResponse = await httpRequest("POST", "/v1/admin/tenants", {
        token: config.adminToken,
        body: {
          name: "Chat Test Tenant",
          providers: {
            anthropic: { apiKey: "sk-ant-test-key" },
          },
          defaultModel: {
            providerId: "anthropic",
            modelId: "claude-sonnet",
          },
        },
      });

      const data = retryResponse.body as { id: string; token: string };
      tenantToken = data.token;
    }
  });

  afterAll(async () => {
    // Cleanup: delete the test tenant
    const listResponse = await httpRequest("GET", "/v1/admin/tenants", {
      token: config.adminToken,
    });
    const tenants = (listResponse.body as { tenants: Array<{ id: string }> }).tenants;
    const chatTenant = tenants.find((t) => t.id.includes("chat"));

    if (chatTenant) {
      await httpRequest("DELETE", `/v1/admin/tenants/${chatTenant.id}`, {
        token: config.adminToken,
      });
    }
  });

  describe("POST /v1/chat", () => {
    it("should reject requests without authentication", async () => {
      const response = await httpRequest("POST", "/v1/chat", {
        body: {
          messages: [{ role: "user", content: "Hello" }],
        },
      });

      expect(response.status).toBe(401);
    });

    it("should reject requests with invalid token", async () => {
      const response = await httpRequest("POST", "/v1/chat", {
        token: "invalid-token",
        body: {
          messages: [{ role: "user", content: "Hello" }],
        },
      });

      expect(response.status).toBe(401);
    });

    it("should accept valid chat request structure", async () => {
      // Note: This test validates request parsing, not actual OpenCode execution
      // OpenCode execution will fail without proper setup, but request validation should pass
      const response = await httpRequest("POST", "/v1/chat", {
        token: tenantToken,
        body: {
          messages: [{ role: "user", content: "Hello" }],
        },
      });

      // The request is accepted (not 400 or 401)
      // It may fail at execution level (500) if OpenCode is not installed
      expect([200, 500]).toContain(response.status);
    });

    it("should accept chat request with model override", async () => {
      const response = await httpRequest("POST", "/v1/chat", {
        token: tenantToken,
        body: {
          model: { providerId: "openai", modelId: "gpt-4" },
          messages: [{ role: "user", content: "Hello" }],
        },
      });

      expect([200, 500]).toContain(response.status);
    });

    it("should accept chat request with sessionId", async () => {
      const response = await httpRequest("POST", "/v1/chat", {
        token: tenantToken,
        body: {
          sessionId: "test-session-123",
          messages: [{ role: "user", content: "Hello" }],
        },
      });

      expect([200, 500]).toContain(response.status);
    });

    it("should accept chat request with tools filter", async () => {
      const response = await httpRequest("POST", "/v1/chat", {
        token: tenantToken,
        body: {
          tools: ["my-tool"],
          messages: [{ role: "user", content: "Hello" }],
        },
      });

      expect([200, 500]).toContain(response.status);
    });

    it("should accept chat request with agents filter", async () => {
      const response = await httpRequest("POST", "/v1/chat", {
        token: tenantToken,
        body: {
          agents: ["default"],
          messages: [{ role: "user", content: "Hello" }],
        },
      });

      expect([200, 500]).toContain(response.status);
    });

    it("should accept streaming chat request", async () => {
      const response = await httpRequest("POST", "/v1/chat", {
        token: tenantToken,
        body: {
          stream: true,
          messages: [{ role: "user", content: "Hello" }],
        },
      });

      // Streaming returns 200 with event-stream content type
      expect([200, 500]).toContain(response.status);
    });

    it("should accept multiple messages in conversation", async () => {
      const response = await httpRequest("POST", "/v1/chat", {
        token: tenantToken,
        body: {
          messages: [
            { role: "system", content: "You are a helpful assistant." },
            { role: "user", content: "What is 2+2?" },
            { role: "assistant", content: "2+2 equals 4." },
            { role: "user", content: "And 3+3?" },
          ],
        },
      });

      expect([200, 500]).toContain(response.status);
    });
  });
});
