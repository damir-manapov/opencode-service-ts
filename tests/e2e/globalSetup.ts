/**
 * E2E Global Setup - Auto-starts the server before tests
 */
import { type ChildProcess, execSync, spawn } from "node:child_process";
import { access, mkdir, rm } from "node:fs/promises";

const E2E_PORT = 3333;
const E2E_DATA_DIR = "/tmp/e2e-test-data";
const E2E_ADMIN_TOKEN = "test-admin-token";
const SERVER_START_TIMEOUT = 30000;

let serverProcess: ChildProcess | null = null;

async function ensureBuilt(): Promise<void> {
  const mainJs = "dist/src/main.js";
  try {
    await access(mainJs);
  } catch {
    console.log("📦 Building project...");
    execSync("pnpm build", { cwd: process.cwd(), stdio: "inherit" });
    console.log("✅ Build complete");
  }
}

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        return;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server did not start within ${timeoutMs}ms`);
}

export async function setup(): Promise<void> {
  // Check if server is already running
  const baseUrl = `http://localhost:${E2E_PORT}`;
  try {
    const res = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      console.log("\n✅ Using existing server at", baseUrl);
      return;
    }
  } catch {
    // Server not running, we'll start it
  }

  console.log("\n🚀 Starting test server...");

  // Build if needed
  await ensureBuilt();

  // Clean up data directory
  await rm(E2E_DATA_DIR, { recursive: true, force: true });
  await mkdir(E2E_DATA_DIR, { recursive: true });

  // Start the server
  serverProcess = spawn("node", ["dist/src/main.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(E2E_PORT),
      DATA_DIR: E2E_DATA_DIR,
      ADMIN_TOKENS: E2E_ADMIN_TOKEN,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Log server output for debugging
  serverProcess.stdout?.on("data", (data) => {
    const msg = data.toString().trim();
    if (msg) console.log(`[server] ${msg}`);
  });

  serverProcess.stderr?.on("data", (data) => {
    const msg = data.toString().trim();
    if (msg) console.error(`[server:err] ${msg}`);
  });

  serverProcess.on("error", (err) => {
    console.error("Failed to start server:", err);
  });

  serverProcess.on("exit", (code) => {
    if (code !== null && code !== 0) {
      console.error(`Server exited with code ${code}`);
    }
  });

  // Store for teardown
  (globalThis as Record<string, unknown>).__E2E_SERVER_PROCESS__ = serverProcess;

  // Wait for server to be ready
  await waitForServer(baseUrl, SERVER_START_TIMEOUT);
  console.log("✅ Test server ready at", baseUrl);
}

export async function teardown(): Promise<void> {
  const proc = (globalThis as Record<string, unknown>).__E2E_SERVER_PROCESS__ as
    | ChildProcess
    | undefined;

  if (proc && !proc.killed) {
    console.log("\n🛑 Stopping test server...");
    proc.kill("SIGTERM");

    // Wait for graceful shutdown
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        proc.kill("SIGKILL");
        resolve();
      }, 5000);

      proc.on("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    console.log("✅ Test server stopped");
  }

  // Cleanup data directory
  await rm(E2E_DATA_DIR, { recursive: true, force: true });
}
