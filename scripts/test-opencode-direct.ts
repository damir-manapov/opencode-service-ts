#!/usr/bin/env bun
/**
 * Test OpenCode SDK directly
 * Usage: bun scripts/test-opencode-direct.ts [prompt]
 *
 * Examples:
 *   bun scripts/test-opencode-direct.ts
 *   bun scripts/test-opencode-direct.ts "What is 2+2?"
 *
 * This spins up a new OpenCode server and tests prompting directly.
 */

import { createOpencode } from "@opencode-ai/sdk";

const OPENROUTER_API_KEY = process.env._OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
const DEFAULT_PROMPT = "Say 'Hello from OpenCode!' in exactly those words.";
const userPrompt = process.argv[2] || DEFAULT_PROMPT;

async function main() {
  console.log("🧪 Testing OpenCode SDK directly (simulating service behavior)\n");

  if (!OPENROUTER_API_KEY) {
    console.error("❌ No API key found. Set _OPENROUTER_API_KEY or OPENROUTER_API_KEY");
    process.exit(1);
  }
  console.log(`API Key: ${OPENROUTER_API_KEY.slice(0, 15)}...`);

  // DO NOT set the env var - simulate service behavior where OpenCode starts without it
  // process.env.OPENROUTER_API_KEY = OPENROUTER_API_KEY;
  // Clear any existing env var to simulate fresh start
  delete process.env.OPENROUTER_API_KEY;

  console.log("\n📝 Starting OpenCode server...");

  // Check if server is already running (simulating service behavior)
  const existingServerUrl = "http://127.0.0.1:4096";
  let client: Awaited<ReturnType<typeof createOpencode>>["client"] | null = null;
  let instance: Awaited<ReturnType<typeof createOpencode>> | null = null;

  try {
    const healthRes = await fetch(`${existingServerUrl}/global/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (healthRes.ok) {
      console.log("✅ Connecting to EXISTING OpenCode server (like service does)");
      const { createOpencodeClient } = await import("@opencode-ai/sdk");
      client = await createOpencodeClient({ baseUrl: existingServerUrl });
    } else {
      throw new Error("Server not healthy");
    }
  } catch {
    console.log("📝 No existing server, starting new one...");
    instance = await createOpencode({
      hostname: "127.0.0.1",
      port: 14999, // Use different port to avoid conflicts with service
      timeout: 30000,
    });
    client = instance.client;
  }

  const baseUrl = instance ? `http://127.0.0.1:14999` : existingServerUrl;
  console.log("✅ OpenCode server started");

  try {
    // Check health via HTTP (as per docs: GET /global/health)
    const healthRes = await fetch(`${baseUrl}/global/health`);
    const health = (await healthRes.json()) as { healthy: boolean; version: string };
    console.log(`✅ Server health: ${health.healthy}, version: ${health.version}`);

    // Check providers
    const providers = await client.provider.list();
    console.log(`✅ Connected providers: ${providers.data?.connected?.join(", ") || "none"}`);

    // Check auth methods available
    const authMethods = await client.provider.auth();
    console.log("📋 Provider auth methods:");
    for (const [providerID, methods] of Object.entries(authMethods.data || {})) {
      const methodTypes = (methods as Array<{ type: string }>).map((m) => m.type);
      console.log(`   ${providerID}: ${methodTypes.join(", ")}`);
    }

    // Create a temp directory like the service does - WITH GIT INIT
    const workspaceDir = `/tmp/opencode-workspaces/test-${Date.now()}`;
    const fs = await import("node:fs/promises");
    const { execSync } = await import("node:child_process");
    await fs.mkdir(workspaceDir, { recursive: true });

    // Initialize as git repo (OpenCode requires this for directory-based sessions)
    execSync("git init", { cwd: workspaceDir, stdio: "ignore" });
    console.log(`📁 Using workspace directory: ${workspaceDir} (git initialized)`);

    // Create opencode.json in the workspace (like service does)
    const opencodeConfig = {
      $schema: "https://opencode.ai/config.json",
      provider: { openrouter: {} },
      model: "openrouter/openai/gpt-4o-mini",
    };
    await fs.writeFile(`${workspaceDir}/opencode.json`, JSON.stringify(opencodeConfig, null, 2));
    console.log("📝 Created opencode.json in workspace");

    // Set auth WITH directory (like the service does)
    console.log(`\n📝 Setting auth for openrouter (with directory)...`);
    const authResponse = await client.auth.set({
      path: { id: "openrouter" },
      query: { directory: workspaceDir },
      body: { type: "api", key: OPENROUTER_API_KEY },
    });
    if (authResponse.error) {
      console.error(`❌ auth.set() failed: ${JSON.stringify(authResponse.error)}`);
    } else {
      console.log(`✅ auth.set() succeeded`);
    }

    // Check providers again after auth.set()
    const providersAfter = await client.provider.list();
    console.log(
      `✅ Connected providers after auth: ${providersAfter.data?.connected?.join(", ") || "none"}`,
    );

    // Create session WITHOUT directory parameter (causes hangs)
    // The auth.set() with directory is sufficient for context
    console.log("\n📝 Creating session (without directory - avoids hanging)...");
    const sessionResponse = await client.session.create({
      body: { title: "Direct Test" },
    });

    if (!sessionResponse.data) {
      console.error("❌ Failed to create session:", sessionResponse.error);
      process.exit(1);
    }

    const session = sessionResponse.data;
    console.log(`✅ Session created: ${session.id}`);

    try {
      // Subscribe to events
      console.log("\n📝 Subscribing to events...");
      const eventResponse = await client.event.subscribe();
      console.log("✅ Subscribed to events");

      // Send prompt
      console.log(`\n📝 Sending prompt: "${userPrompt}"...`);
      await client.session.promptAsync({
        path: { id: session.id },
        body: {
          model: { providerID: "openrouter", modelID: "openai/gpt-4o-mini" },
          parts: [{ type: "text", text: userPrompt }],
        },
      });
      console.log("✅ Prompt sent");

      // Listen for response
      console.log("\n📝 Waiting for response...");
      const textParts: string[] = [];
      let timeout: ReturnType<typeof setTimeout> | null = null;

      const timeoutPromise = new Promise<void>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Timeout waiting for response")), 30000);
      });

      const eventPromise = (async () => {
        for await (const event of eventResponse.stream) {
          console.log(`   Event: ${event.type}`);

          if (event.type === "message.part.updated") {
            const props = event.properties as { part?: { type?: string }; delta?: string };
            if (props.delta && props.part?.type === "text") {
              process.stdout.write(props.delta);
              textParts.push(props.delta);
            }
          }

          if (event.type === "session.idle") {
            const props = event.properties as { sessionID?: string };
            if (props.sessionID === session.id) {
              console.log("\n✅ Session completed");
              break;
            }
          }

          if (event.type === "session.error") {
            const props = event.properties as {
              sessionID?: string;
              error?: { data?: { message?: string }; message?: string };
            };
            // Parse nested error structure
            let errorMessage = "Session error";
            if (props.error?.data?.message) {
              try {
                const parsed = JSON.parse(props.error.data.message) as {
                  error?: { type?: string; message?: string; code?: string };
                };
                if (parsed.error?.message) {
                  const code = parsed.error.code || parsed.error.type;
                  errorMessage = code ? `[${code}] ${parsed.error.message}` : parsed.error.message;
                }
              } catch {
                errorMessage = props.error.data.message;
              }
            } else if (props.error?.message) {
              errorMessage = props.error.message;
            }
            console.log(`   ❌ Session error: ${errorMessage}`);
            if (props.sessionID === session.id) {
              throw new Error(errorMessage);
            }
          }
        }
      })();

      await Promise.race([eventPromise, timeoutPromise]);
      if (timeout) clearTimeout(timeout);

      console.log(`\n\n🎉 Response: ${textParts.join("")}`);
    } finally {
      // Cleanup session
      await client.session.delete({ path: { id: session.id } }).catch(() => {});
    }
  } finally {
    // Shutdown server only if we started it
    if (instance) {
      console.log("\n📝 Shutting down server...");
      instance.server.close();
      console.log("✅ Server stopped");
    } else {
      console.log("\n📝 Leaving existing server running");
    }
  }

  // Force exit since event stream keeps process alive
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
