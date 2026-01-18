import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/e2e/**/*.test.ts"],
    testTimeout: 60000,
    hookTimeout: 60000,
    // Run tests sequentially since they share server state
    sequence: {
      concurrent: false,
    },
    // Auto-start and stop the server
    globalSetup: ["tests/e2e/globalSetup.ts"],
  },
});
