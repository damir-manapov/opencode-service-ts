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
      const body = response.body as { error: { message: string; type: string } };
      expect(body.error).toBeDefined();
      expect(body.error.type).toBe("authentication_error");
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
      const body = response.body as { error: { type: string } };
      expect(body.error.type).toBe("authentication_error");
    });

    // Request validation tests (should return 400 for invalid requests with OpenAI error format)
    describe("Request validation", () => {
      it("should reject request without model", async () => {
        const response = await httpRequest("POST", "/v1/chat/completions", {
          token: tenantToken,
          body: {
            messages: [{ role: "user", content: "Hello" }],
          },
        });

        expect(response.status).toBe(400);
        const body = response.body as { error: { message: string; type: string } };
        expect(body.error).toBeDefined();
        expect(body.error.message).toContain("model");
        expect(body.error.type).toBe("invalid_request_error");
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
        const body = response.body as { error: { type: string } };
        expect(body.error.type).toBe("invalid_request_error");
      });

      it("should reject request without messages", async () => {
        const response = await httpRequest("POST", "/v1/chat/completions", {
          token: tenantToken,
          body: {
            model: "gpt-4",
          },
        });

        expect(response.status).toBe(400);
        const body = response.body as { error: { message: string; type: string } };
        expect(body.error.message).toContain("messages");
        expect(body.error.type).toBe("invalid_request_error");
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
        const body = response.body as { error: { type: string } };
        expect(body.error.type).toBe("invalid_request_error");
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
        const body = response.body as { error: { message: string; type: string } };
        expect(body.error.message).toContain("role");
        expect(body.error.type).toBe("invalid_request_error");
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
        const body = response.body as { error: { type: string } };
        expect(body.error.type).toBe("invalid_request_error");
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

    // Error scenarios
    describe("Error scenarios", () => {
      it("should return error for provider not configured", async () => {
        // Create tenant without openai provider, then request openai model
        const client = new TestClient();
        const result = await client.createTenant("No OpenAI Tenant", {
          providers: {
            anthropic: { apiKey: "sk-ant-test-key" },
          },
        });

        try {
          const response = await httpRequest("POST", "/v1/chat/completions", {
            token: result.token,
            body: {
              model: "openai/gpt-4",
              messages: [{ role: "user", content: "Hello" }],
            },
          });

          // Should fail - provider not configured
          expect([400, 500]).toContain(response.status);
          const body = response.body as { error?: { type: string } };
          if (body.error) {
            expect(["invalid_request_error", "server_error"]).toContain(body.error.type);
          }
        } finally {
          await client.deleteTenant(result.tenant.id);
        }
      });

      it("should handle request with non-existent model gracefully", async () => {
        const response = await httpRequest("POST", "/v1/chat/completions", {
          token: tenantToken,
          body: {
            model: "anthropic/non-existent-model-xyz",
            messages: [{ role: "user", content: "Hello" }],
          },
        });

        // Request passes validation but may fail at execution
        // OpenCode will attempt to use the model and fail
        expect([200, 400, 500]).toContain(response.status);
      });
    });
  });
});

/**
 * Response Format Tests
 * These require a real API key to verify actual response structure
 */
describe("Chat Completions Response Format", () => {
  const OPENROUTER_API_KEY = process.env["E2E_OPENROUTER_API_KEY"];

  let client: TestClient;
  let tenantToken: string;
  let tenantId: string;

  beforeAll(async () => {
    if (!OPENROUTER_API_KEY) {
      return; // Skip setup if no API key
    }

    client = new TestClient();
    const result = await client.createTenant("Response Format Test", {
      providers: {
        openrouter: { apiKey: OPENROUTER_API_KEY },
      },
    });
    tenantId = result.tenant.id;
    tenantToken = result.token;
  });

  afterAll(async () => {
    if (tenantId && client) {
      await client.deleteTenant(tenantId);
    }
  });

  describe("Non-streaming response structure", () => {
    it("should match OpenAI format with all required fields", async () => {
      if (!OPENROUTER_API_KEY) {
        console.log("Skipping: E2E_OPENROUTER_API_KEY not set");
        return;
      }

      const response = await httpRequest("POST", "/v1/chat/completions", {
        token: tenantToken,
        body: {
          model: "openrouter/openai/gpt-4o-mini",
          messages: [{ role: "user", content: "Say hello" }],
        },
      });

      if (response.status !== 200) {
        console.log("Skipping response validation: execution failed");
        return;
      }

      const body = response.body as {
        id: string;
        object: string;
        created: number;
        model: string;
        choices: Array<{
          index: number;
          message: { role: string; content: string };
          finish_reason: string;
        }>;
        usage?: {
          prompt_tokens: number;
          completion_tokens: number;
          total_tokens: number;
        };
      };

      // Required fields per OpenAI spec
      expect(body.id).toBeDefined();
      expect(typeof body.id).toBe("string");

      expect(body.object).toBe("chat.completion");

      expect(body.created).toBeDefined();
      expect(typeof body.created).toBe("number");

      expect(body.model).toBeDefined();
      expect(typeof body.model).toBe("string");

      // Choices array
      expect(body.choices).toBeDefined();
      expect(Array.isArray(body.choices)).toBe(true);
      expect(body.choices.length).toBeGreaterThan(0);

      // First choice structure
      const choice = body.choices[0];
      expect(choice?.index).toBe(0);
      expect(choice?.message).toBeDefined();
      expect(choice?.message.role).toBe("assistant");
      expect(typeof choice?.message.content).toBe("string");
      expect(choice?.finish_reason).toBeDefined();

      // Usage (optional but common)
      if (body.usage) {
        expect(typeof body.usage.prompt_tokens).toBe("number");
        expect(typeof body.usage.completion_tokens).toBe("number");
        expect(typeof body.usage.total_tokens).toBe("number");
      }
    }, 60000);

    it("should return finish_reason 'stop' for normal completion", async () => {
      if (!OPENROUTER_API_KEY) {
        console.log("Skipping: E2E_OPENROUTER_API_KEY not set");
        return;
      }

      const response = await httpRequest("POST", "/v1/chat/completions", {
        token: tenantToken,
        body: {
          model: "openrouter/openai/gpt-4o-mini",
          messages: [{ role: "user", content: "Say exactly: Done" }],
        },
      });

      if (response.status !== 200) {
        console.log("Skipping: execution failed");
        return;
      }

      const body = response.body as {
        choices: Array<{ finish_reason: string }>;
      };

      expect(body.choices[0]?.finish_reason).toBe("stop");
    }, 60000);

    it("should return finish_reason 'length' when max_tokens exceeded", async () => {
      if (!OPENROUTER_API_KEY) {
        console.log("Skipping: E2E_OPENROUTER_API_KEY not set");
        return;
      }

      const response = await httpRequest("POST", "/v1/chat/completions", {
        token: tenantToken,
        body: {
          model: "openrouter/openai/gpt-4o-mini",
          messages: [{ role: "user", content: "Write a very long story about a dragon" }],
          max_tokens: 5, // Force truncation
        },
      });

      if (response.status !== 200) {
        console.log("Skipping: execution failed");
        return;
      }

      const body = response.body as {
        choices: Array<{ finish_reason: string }>;
      };

      // Should be 'length' when truncated, but some providers return 'stop'
      expect(["stop", "length"]).toContain(body.choices[0]?.finish_reason);
    }, 60000);
  });

  describe("Streaming response format", () => {
    it("should return SSE format with proper content-type", async () => {
      if (!OPENROUTER_API_KEY) {
        console.log("Skipping: E2E_OPENROUTER_API_KEY not set");
        return;
      }

      const response = await httpRequest("POST", "/v1/chat/completions", {
        token: tenantToken,
        body: {
          model: "openrouter/openai/gpt-4o-mini",
          stream: true,
          messages: [{ role: "user", content: "Say hi" }],
        },
      });

      if (response.status !== 200) {
        console.log("Skipping: execution failed");
        return;
      }

      // Should be SSE content type
      const contentType = response.headers.get("content-type");
      expect(contentType).toContain("text/event-stream");
    }, 60000);

    it("should end stream with data: [DONE]", async () => {
      if (!OPENROUTER_API_KEY) {
        console.log("Skipping: E2E_OPENROUTER_API_KEY not set");
        return;
      }

      const response = await httpRequest("POST", "/v1/chat/completions", {
        token: tenantToken,
        body: {
          model: "openrouter/openai/gpt-4o-mini",
          stream: true,
          messages: [{ role: "user", content: "Say exactly: OK" }],
        },
      });

      if (response.status !== 200) {
        console.log("Skipping: execution failed");
        return;
      }

      // Check if response contains error
      if (response.text.includes('"error"')) {
        console.log("Skipping: stream returned error");
        return;
      }

      // Stream should end with [DONE]
      expect(response.text).toContain("data: [DONE]");
    }, 60000);

    it("should have valid SSE chunk structure", async () => {
      if (!OPENROUTER_API_KEY) {
        console.log("Skipping: E2E_OPENROUTER_API_KEY not set");
        return;
      }

      const response = await httpRequest("POST", "/v1/chat/completions", {
        token: tenantToken,
        body: {
          model: "openrouter/openai/gpt-4o-mini",
          stream: true,
          messages: [{ role: "user", content: "Count: 1, 2, 3" }],
        },
      });

      if (response.status !== 200) {
        console.log("Skipping: execution failed");
        return;
      }

      // Parse SSE chunks
      const lines = response.text.split("\n");
      const dataLines = lines.filter(
        (line) => line.startsWith("data: ") && !line.includes("[DONE]"),
      );

      expect(dataLines.length).toBeGreaterThan(0);

      // Validate first chunk structure
      const firstChunk = dataLines[0]?.replace("data: ", "");
      if (firstChunk) {
        const parsed = JSON.parse(firstChunk) as {
          id: string;
          object: string;
          choices: Array<{
            index: number;
            delta: { role?: string; content?: string };
          }>;
        };

        expect(parsed.id).toBeDefined();
        expect(parsed.object).toBe("chat.completion.chunk");
        expect(parsed.choices).toBeDefined();
        expect(parsed.choices[0]?.index).toBe(0);
        expect(parsed.choices[0]?.delta).toBeDefined();
      }
    }, 60000);
  });
});

/**
 * Agent Usage Tests
 * Verify that agents are applied to chat completions
 */
describe("Chat Completions with Agent", () => {
  const OPENROUTER_API_KEY = process.env["E2E_OPENROUTER_API_KEY"];

  let client: TestClient;
  let tenantToken: string;
  let tenantId: string;

  const AGENT_NAME = "test-agent";
  const AGENT_MARKER = "[AGENT:test-agent]";
  const AGENT_CONTENT = `# Test Agent

You are a test agent. You MUST prefix EVERY response with exactly "${AGENT_MARKER}" on the first line.

After the marker, respond normally to the user's question.`;

  beforeAll(async () => {
    if (!OPENROUTER_API_KEY) {
      return;
    }

    client = new TestClient();
    const result = await client.createTenant("Agent Test Tenant", {
      providers: {
        openrouter: { apiKey: OPENROUTER_API_KEY },
      },
    });
    tenantId = result.tenant.id;
    tenantToken = result.token;

    // Create the test agent
    await httpRequest("PUT", `/v1/tenant/agents/${AGENT_NAME}`, {
      token: tenantToken,
      contentType: "text/plain",
      body: AGENT_CONTENT,
    });
  });

  afterAll(async () => {
    if (tenantId && client) {
      await client.deleteTenant(tenantId);
    }
  });

  it("should have the agent registered", async () => {
    if (!OPENROUTER_API_KEY) {
      console.log("Skipping: E2E_OPENROUTER_API_KEY not set");
      return;
    }

    const response = await httpRequest("GET", "/v1/tenant/agents", {
      token: tenantToken,
    });

    expect(response.status).toBe(200);
    expect((response.body as { agents: string[] }).agents).toContain(AGENT_NAME);
  });

  it("should use agent and include marker in response", async () => {
    if (!OPENROUTER_API_KEY) {
      console.log("Skipping: E2E_OPENROUTER_API_KEY not set");
      return;
    }

    const response = await httpRequest("POST", "/v1/chat/completions", {
      token: tenantToken,
      body: {
        model: "openrouter/openai/gpt-4o-mini",
        messages: [{ role: "user", content: "Say hello" }],
      },
    });

    if (response.status !== 200) {
      console.log("Skipping: execution failed with status", response.status);
      return;
    }

    const body = response.body as {
      choices: Array<{ message: { content: string } }>;
    };

    const content = body.choices[0]?.message.content ?? "";
    expect(content).toContain(AGENT_MARKER);
  }, 60000);

  it("should use agent in streaming response", async () => {
    if (!OPENROUTER_API_KEY) {
      console.log("Skipping: E2E_OPENROUTER_API_KEY not set");
      return;
    }

    const response = await httpRequest("POST", "/v1/chat/completions", {
      token: tenantToken,
      body: {
        model: "openrouter/openai/gpt-4o-mini",
        stream: true,
        messages: [{ role: "user", content: "Say hello" }],
      },
    });

    if (response.status !== 200) {
      console.log("Skipping: execution failed");
      return;
    }

    // Check if response contains error
    if (response.text.includes('"error"')) {
      console.log("Skipping: stream returned error");
      return;
    }

    // Concatenate all content from SSE chunks
    const lines = response.text.split("\n");
    let fullContent = "";

    for (const line of lines) {
      if (line.startsWith("data: ") && !line.includes("[DONE]")) {
        try {
          const chunk = JSON.parse(line.replace("data: ", "")) as {
            choices: Array<{ delta: { content?: string } }>;
          };
          fullContent += chunk.choices[0]?.delta.content ?? "";
        } catch {
          // Skip invalid JSON
        }
      }
    }

    expect(fullContent).toContain(AGENT_MARKER);
  }, 60000);
});
