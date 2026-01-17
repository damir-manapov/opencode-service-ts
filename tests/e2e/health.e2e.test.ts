import { describe, expect, it } from "vitest";
import { httpRequest } from "./setup.js";

describe("Health API (e2e)", () => {
  describe("GET /health", () => {
    it("should return health status", async () => {
      const response = await httpRequest("GET", "/health");

      expect(response.status).toBe(200);
      const body = response.body as { status: string; timestamp: string };
      expect(body.status).toBe("ok");
      expect(body.timestamp).toBeDefined();
    });
  });
});
