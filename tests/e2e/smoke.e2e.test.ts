/**
 * Smoke tests using the official OpenAI SDK
 * Validates OpenAI API compatibility
 */
import OpenAI from "openai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { httpRequest, TestClient } from "./setup.js";

const OPENROUTER_API_KEY = process.env["E2E_OPENROUTER_API_KEY"];
const BASE_URL = process.env["E2E_BASE_URL"] ?? "http://localhost:3333";
const MODEL = "openrouter/openai/gpt-4o-mini";

/**
 * OpenAI SDK Smoke Tests
 */
describe("Smoke: OpenAI SDK", () => {
  let client: TestClient;
  let tenantId: string;
  let tenantToken: string;
  let openai: OpenAI;

  const AGENT_NAME = "smoke-agent";
  const AGENT_MARKER = "[SMOKE-AGENT]";
  const TOOL_NAME = "get-smoke-value";
  const SMOKE_VALUE = "SMOKE123";

  beforeAll(async () => {
    if (!OPENROUTER_API_KEY) {
      throw new Error("E2E_OPENROUTER_API_KEY environment variable is required");
    }

    client = new TestClient();
    const result = await client.createTenant("OpenAI SDK Smoke Test", {
      providers: {
        openrouter: { apiKey: OPENROUTER_API_KEY },
      },
    });
    tenantId = result.tenant.id;
    tenantToken = result.token;

    // Create OpenAI client pointing at our server
    openai = new OpenAI({
      apiKey: tenantToken,
      baseURL: `${BASE_URL}/v1`,
    });

    // Create agent
    await httpRequest("PUT", `/v1/tenant/agents/${AGENT_NAME}`, {
      token: tenantToken,
      contentType: "text/plain",
      body: `# Smoke Test Agent\n\nYou MUST prefix every response with "${AGENT_MARKER}" on the first line.`,
    });

    // Create tool
    await httpRequest("PUT", `/v1/tenant/tools/${TOOL_NAME}`, {
      token: tenantToken,
      contentType: "text/plain",
      body: `
import { tool } from "@opencode-ai/plugin";

export default tool({
  description: "Returns the smoke test value. Call this when asked for the smoke value.",
  args: {},
  async execute() {
    return "${SMOKE_VALUE}";
  },
});
`,
    });
  });

  afterAll(async () => {
    if (tenantId && client) {
      await client.deleteTenant(tenantId);
    }
  });

  it("should handle basic chat completion", async () => {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: "Say exactly: HELLO" }],
    });

    expect(response.id).toBeDefined();
    expect(response.object).toBe("chat.completion");
    expect(response.choices[0]?.message.content).toContain("HELLO");
  });

  it("should handle streaming chat completion", async () => {
    const stream = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: "Say exactly: STREAM" }],
      stream: true,
    });

    let content = "";
    for await (const chunk of stream) {
      content += chunk.choices[0]?.delta?.content ?? "";
    }

    expect(content).toContain("STREAM");
  });

  it("should use agent with @syntax", async () => {
    const response = await openai.chat.completions.create({
      model: `${MODEL}@${AGENT_NAME}`,
      messages: [{ role: "user", content: "Say hello" }],
    });

    expect(response.choices[0]?.message.content).toContain(AGENT_MARKER);
  });

  it("should use custom tool", async () => {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "user",
          content: "What is the smoke value? Use the get-smoke-value tool.",
        },
      ],
    });

    expect(response.choices[0]?.message.content).toContain(SMOKE_VALUE);
  });
});
