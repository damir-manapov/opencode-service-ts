/**
 * E2E Test Setup
 *
 * These tests are implementation-agnostic - they test the HTTP API
 * against a running server. This allows testing both TypeScript and Go implementations.
 *
 * Usage:
 *   1. Start the server: DATA_DIR=/tmp/e2e ADMIN_TOKENS=test-admin-token pnpm dev
 *   2. Run tests: pnpm test:e2e
 *
 * Environment variables:
 *   - E2E_BASE_URL: Base URL of the server (default: http://localhost:3000)
 *   - E2E_ADMIN_TOKEN: Admin token for authentication (default: test-admin-token)
 */

export interface TestConfig {
  baseUrl: string;
  adminToken: string;
}

export function getTestConfig(): TestConfig {
  return {
    baseUrl: process.env["E2E_BASE_URL"] ?? "http://localhost:3000",
    adminToken: process.env["E2E_ADMIN_TOKEN"] ?? "test-admin-token",
  };
}

/**
 * Helper to make HTTP requests to the test server
 */
export async function httpRequest(
  method: string,
  path: string,
  options: {
    body?: unknown;
    headers?: Record<string, string>;
    token?: string;
    contentType?: string;
  } = {},
): Promise<{ status: number; body: unknown; text: string; headers: Headers }> {
  const config = getTestConfig();
  const url = `${config.baseUrl}${path}`;

  const headers: Record<string, string> = {
    ...options.headers,
  };

  if (options.token) {
    headers["Authorization"] = `Bearer ${options.token}`;
  }

  if (options.body !== undefined) {
    if (options.contentType === "text/plain") {
      headers["Content-Type"] = "text/plain";
    } else {
      headers["Content-Type"] = "application/json";
    }
  }

  const response = await fetch(url, {
    method,
    headers,
    body:
      options.body !== undefined
        ? options.contentType === "text/plain"
          ? String(options.body)
          : JSON.stringify(options.body)
        : undefined,
  });

  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  return {
    status: response.status,
    body,
    text,
    headers: response.headers,
  };
}

/**
 * Helper class for fluent API testing
 */
export class TestClient {
  private config: TestConfig;

  constructor() {
    this.config = getTestConfig();
  }

  get baseUrl(): string {
    return this.config.baseUrl;
  }

  get adminToken(): string {
    return this.config.adminToken;
  }

  // Admin API helpers
  async createTenant(
    name: string,
    options?: { providers?: Record<string, unknown> },
  ): Promise<{ tenant: { id: string; name: string }; token: string }> {
    const res = await httpRequest("POST", "/v1/admin/tenants", {
      token: this.adminToken,
      body: { name, ...options },
    });
    if (res.status !== 201) {
      throw new Error(`Failed to create tenant: ${res.status} ${res.text}`);
    }
    return res.body as { tenant: { id: string; name: string }; token: string };
  }

  async deleteTenant(id: string): Promise<void> {
    await httpRequest("DELETE", `/v1/admin/tenants/${id}`, {
      token: this.adminToken,
    });
  }
}
