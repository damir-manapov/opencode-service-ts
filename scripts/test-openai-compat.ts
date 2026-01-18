import OpenAI from "openai";

/**
 * Test OpenAI API compatibility
 * Usage: bun scripts/test-openai-compat.ts
 *
 * Requires:
 * - Server running: DATA_DIR=/tmp/ocs-test ADMIN_TOKENS=admin-secret pnpm dev
 * - Environment: BASE_URL (default: http://localhost:3000)
 *
 * Note: Chat completions require OpenCode server to be running.
 * Models endpoint works without OpenCode.
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "admin-secret";
const SKIP_CHAT = process.env.SKIP_CHAT === "true";

async function main() {
  console.log("🧪 Testing OpenAI API compatibility\n");
  console.log(`Base URL: ${BASE_URL}`);
  if (SKIP_CHAT) {
    console.log("⚠️  SKIP_CHAT=true - skipping chat completions tests");
  }

  // Step 1: Create a test tenant
  console.log("\n📝 Step 1: Creating test tenant...");
  const createResponse = await fetch(`${BASE_URL}/v1/admin/tenants`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ADMIN_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "OpenAI Compat Test",
      providers: {
        openrouter: { apiKey: process.env._OPENROUTER_API_KEY || "test-key" },
      },
      defaultModel: {
        providerId: "openrouter",
        modelId: "openai/gpt-4o-mini",
      },
    }),
  });

  if (!createResponse.ok) {
    const error = await createResponse.text();
    console.error(`❌ Failed to create tenant: ${error}`);
    process.exit(1);
  }

  const { token } = (await createResponse.json()) as { token: string };
  console.log(`✅ Tenant created, token: ${token.slice(0, 20)}...`);

  // Step 2: Test with OpenAI SDK
  const client = new OpenAI({
    baseURL: `${BASE_URL}/v1`,
    apiKey: token,
  });

  // Test GET /v1/models
  console.log("\n📝 Step 2: Testing GET /v1/models...");
  try {
    const models = await client.models.list();
    console.log(`✅ Models endpoint works! Found ${models.data.length} models:`);
    for (const model of models.data.slice(0, 5)) {
      console.log(`   - ${model.id} (owned by: ${model.owned_by})`);
    }
    if (models.data.length > 5) {
      console.log(`   ... and ${models.data.length - 5} more`);
    }
  } catch (error) {
    console.error(`❌ Models endpoint failed:`, error);
  }

  if (SKIP_CHAT) {
    console.log("\n⏭️  Skipping chat completions tests (SKIP_CHAT=true)");
    console.log("\n🎉 API format tests completed!");
    return;
  }

  // Test POST /v1/chat/completions (non-streaming)
  const nonStreamingPrompt = "Say 'Hello from OpenCode Service!' in exactly those words.";
  console.log(`\n📝 Step 3: Testing POST /v1/chat/completions (non-streaming)...`);
  console.log(`   Prompt: "${nonStreamingPrompt}"`);
  try {
    const completion = await client.chat.completions.create({
      model: "openrouter/openai/gpt-4o-mini",
      messages: [{ role: "user", content: nonStreamingPrompt }],
      max_tokens: 50,
    });

    console.log(`✅ Chat completions works!`);
    console.log(`   ID: ${completion.id}`);
    console.log(`   Model: ${completion.model}`);
    console.log(`   Response: ${completion.choices[0]?.message.content}`);
    console.log(`   Finish reason: ${completion.choices[0]?.finish_reason}`);
  } catch (error) {
    console.error(`❌ Chat completions failed:`, error);
  }

  // Test POST /v1/chat/completions (streaming)
  const streamingPrompt = "Count from 1 to 5.";
  console.log(`\n📝 Step 4: Testing POST /v1/chat/completions (streaming)...`);
  console.log(`   Prompt: "${streamingPrompt}"`);
  try {
    const stream = await client.chat.completions.create({
      model: "openrouter/openai/gpt-4o-mini",
      messages: [{ role: "user", content: streamingPrompt }],
      max_tokens: 50,
      stream: true,
    });

    process.stdout.write("   Response: ");
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        process.stdout.write(content);
      }
    }
    console.log("\n✅ Streaming works!");
  } catch (error) {
    console.error(`❌ Streaming failed:`, error);
  }

  console.log("\n🎉 All tests completed!");
}

main().catch(console.error);
