import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { httpRequest, TestClient } from "./setup.js";

describe("Chat Completions API (OpenAI-compatible)", () => {
  let client: TestClient;
  let tenantToken: string;
  let tenantId: string;

  beforeAll(async () => {
    client = new TestClient();
    const result = await client.createTenant("Chat Test Tenant", {
      providers: {
        anthropic: { apiKey: "sk-ant-test-key" },
      },
      defaultModel: {
        providerId: "anthropic",
        modelId: "claude-sonnet",
      },
    });
    tenantId = result.tenant.id;
    tenantToken = result.token;
  });

  afterAll(async () => {
    if (tenantId) {
      await client.deleteTenant(tenantId);
    }
  });

  describe("POST /v1/chat/completions", () => {
    it("should reject requests without authentication", async () => {
      const response = await httpRequest("POST", "/v1/chat/completions", {
        body: {
          model: "anthropic/claude-sonnet",
          messages: [{ role: "user", content: "Hello" }],
        },
      });

      expect(response.status).toBe(401);
    });

    it("should reject requests with invalid token", async () => {
      const response = await httpRequest("POST", "/v1/chat/completions", {
        token: "invalid-token",
        body: {
          model: "anthropic/claude-sonnet",
          messages: [{ role: "user", content: "Hello" }],
        },
      });

      expect(response.status).toBe(401);
    });

    // Request validation tests (should return 400 for invalid requests)
    describe("Request validation", () => {
      it("should reject request without model", async () => {
        const response = await httpRequest("POST", "/v1/chat/completions", {
          token: tenantToken,
          body: {
            messages: [{ role: "user", content: "Hello" }],
          },
        });

        expect(response.status).toBe(400);
        expect(response.text).toContain("model");
      });

      it("should reject request with empty model", async () => {
        const response = await httpRequest("POST", "/v1/chat/completions", {
          token: tenantToken,
          body: {
            model: "",
            messages: [{ role: "user", content: "Hello" }],
          },
        });

        expect(response.status).toBe(400);
      });

      it("should reject request without messages", async () => {
        const response = await httpRequest("POST", "/v1/chat/completions", {
          token: tenantToken,
          body: {
            model: "gpt-4",
          },
        });

        expect(response.status).toBe(400);
        expect(response.text).toContain("messages");
      });

      it("should reject request with empty messages array", async () => {
        const response = await httpRequest("POST", "/v1/chat/completions", {
          token: tenantToken,
          body: {
            model: "gpt-4",
            messages: [],
          },
        });

        expect(response.status).toBe(400);
      });

      it("should reject request with invalid message role", async () => {
        const response = await httpRequest("POST", "/v1/chat/completions", {
          token: tenantToken,
          body: {
            model: "gpt-4",
            messages: [{ role: "invalid", content: "Hello" }],
          },
        });

        expect(response.status).toBe(400);
        expect(response.text).toContain("role");
      });

      it("should reject request with invalid temperature", async () => {
        const response = await httpRequest("POST", "/v1/chat/completions", {
          token: tenantToken,
          body: {
            model: "gpt-4",
            messages: [{ role: "user", content: "Hello" }],
            temperature: 5.0, // Max is 2.0
          },
        });

        expect(response.status).toBe(400);
      });
    });

    // Request routing tests (validates auth and routing, not execution)
    describe("Request routing", () => {
      it("should route valid OpenAI-compatible request", async () => {
        const response = await httpRequest("POST", "/v1/chat/completions", {
          token: tenantToken,
          body: {
            model: "anthropic/claude-sonnet",
            messages: [{ role: "user", content: "Hello" }],
          },
        });

        // Request passes validation and auth (not 400 or 401)
        // May fail at execution level (500) if OpenCode is not configured
        expect([200, 500]).toContain(response.status);
      });

      it("should route request with simple model name", async () => {
        const response = await httpRequest("POST", "/v1/chat/completions", {
          token: tenantToken,
          body: {
            model: "gpt-4",
            messages: [{ role: "user", content: "Hello" }],
          },
        });

        expect([200, 500]).toContain(response.status);
      });

      it("should route request with x-tools extension", async () => {
        const response = await httpRequest("POST", "/v1/chat/completions", {
          token: tenantToken,
          body: {
            model: "claude-sonnet",
            "x-tools": ["my-tool"],
            messages: [{ role: "user", content: "Hello" }],
          },
        });

        expect([200, 500]).toContain(response.status);
      });

      it("should route request with x-agents extension", async () => {
        const response = await httpRequest("POST", "/v1/chat/completions", {
          token: tenantToken,
          body: {
            model: "claude-sonnet",
            "x-agents": ["default"],
            messages: [{ role: "user", content: "Hello" }],
          },
        });

        expect([200, 500]).toContain(response.status);
      });

      it("should route streaming chat request", async () => {
        const response = await httpRequest("POST", "/v1/chat/completions", {
          token: tenantToken,
          body: {
            model: "claude-sonnet",
            stream: true,
            messages: [{ role: "user", content: "Hello" }],
          },
        });

        expect([200, 500]).toContain(response.status);
      });

      it("should route multiple messages in conversation", async () => {
        const response = await httpRequest("POST", "/v1/chat/completions", {
          token: tenantToken,
          body: {
            model: "claude-sonnet",
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
});
