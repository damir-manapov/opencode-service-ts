import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIG_DEFAULTS, ConfigService } from "../../src/config/config.service.js";

describe("ConfigService", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("port", () => {
    it("should default to CONFIG_DEFAULTS.PORT", () => {
      delete process.env["PORT"];
      const config = new ConfigService();
      expect(config.get("port")).toBe(CONFIG_DEFAULTS.PORT);
    });

    it("should parse PORT from env", () => {
      process.env["PORT"] = "8080";
      const config = new ConfigService();
      expect(config.get("port")).toBe(8080);
    });

    it("should default to CONFIG_DEFAULTS.PORT for invalid PORT", () => {
      process.env["PORT"] = "invalid";
      const config = new ConfigService();
      expect(config.get("port")).toBe(CONFIG_DEFAULTS.PORT);
    });
  });

  describe("sessionTtl", () => {
    it("should default to CONFIG_DEFAULTS.SESSION_TTL_MS", () => {
      delete process.env["SESSION_TTL"];
      const config = new ConfigService();
      expect(config.get("sessionTtl")).toBe(CONFIG_DEFAULTS.SESSION_TTL_MS);
    });

    it("should parse minutes", () => {
      process.env["SESSION_TTL"] = "30m";
      const config = new ConfigService();
      expect(config.get("sessionTtl")).toBe(30 * 60 * 1000);
    });

    it("should parse hours", () => {
      process.env["SESSION_TTL"] = "12h";
      const config = new ConfigService();
      expect(config.get("sessionTtl")).toBe(12 * 60 * 60 * 1000);
    });

    it("should parse days", () => {
      process.env["SESSION_TTL"] = "7d";
      const config = new ConfigService();
      expect(config.get("sessionTtl")).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it("should default to CONFIG_DEFAULTS.SESSION_TTL_MS for invalid format", () => {
      process.env["SESSION_TTL"] = "invalid";
      const config = new ConfigService();
      expect(config.get("sessionTtl")).toBe(CONFIG_DEFAULTS.SESSION_TTL_MS);
    });
  });

  describe("adminTokens", () => {
    it("should default to empty array", () => {
      delete process.env["ADMIN_TOKENS"];
      const config = new ConfigService();
      expect(config.get("adminTokens")).toEqual([]);
    });

    it("should parse comma-separated tokens", () => {
      process.env["ADMIN_TOKENS"] = "token1,token2,token3";
      const config = new ConfigService();
      expect(config.get("adminTokens")).toEqual(["token1", "token2", "token3"]);
    });

    it("should trim whitespace", () => {
      process.env["ADMIN_TOKENS"] = " token1 , token2 , token3 ";
      const config = new ConfigService();
      expect(config.get("adminTokens")).toEqual(["token1", "token2", "token3"]);
    });

    it("should filter empty tokens", () => {
      process.env["ADMIN_TOKENS"] = "token1,,token2,";
      const config = new ConfigService();
      expect(config.get("adminTokens")).toEqual(["token1", "token2"]);
    });
  });

  describe("allowSelfRegistration", () => {
    it("should default to false", () => {
      delete process.env["ALLOW_SELF_REGISTRATION"];
      const config = new ConfigService();
      expect(config.get("allowSelfRegistration")).toBe(false);
    });

    it("should be true when set to 'true'", () => {
      process.env["ALLOW_SELF_REGISTRATION"] = "true";
      const config = new ConfigService();
      expect(config.get("allowSelfRegistration")).toBe(true);
    });

    it("should be false for other values", () => {
      process.env["ALLOW_SELF_REGISTRATION"] = "yes";
      const config = new ConfigService();
      expect(config.get("allowSelfRegistration")).toBe(false);
    });
  });

  describe("dataDir and predefinedDir", () => {
    it("should have default values", () => {
      delete process.env["DATA_DIR"];
      delete process.env["PREDEFINED_DIR"];
      const config = new ConfigService();
      expect(config.get("dataDir")).toBe(CONFIG_DEFAULTS.DATA_DIR);
      expect(config.get("predefinedDir")).toBe(CONFIG_DEFAULTS.PREDEFINED_DIR);
    });

    it("should parse from env", () => {
      process.env["DATA_DIR"] = "/custom/data";
      process.env["PREDEFINED_DIR"] = "/custom/predefined";
      const config = new ConfigService();
      expect(config.get("dataDir")).toBe("/custom/data");
      expect(config.get("predefinedDir")).toBe("/custom/predefined");
    });
  });
});
