import { describe, expect, it } from "vitest";
import { parseAdminToken, parseToken } from "../../src/auth/token.utils.js";

describe("parseToken", () => {
  it("should parse valid tenant token", () => {
    const result = parseToken("Bearer ocs_acme_sk_abc123");
    expect(result).toEqual({ tenantId: "acme", secret: "sk_abc123" });
  });

  it("should parse token with complex tenant id", () => {
    const result = parseToken("Bearer ocs_my-tenant-123_sk_secret456");
    expect(result).toEqual({ tenantId: "my-tenant-123", secret: "sk_secret456" });
  });

  it("should return null for missing header", () => {
    expect(parseToken(undefined)).toBeNull();
  });

  it("should return null for empty header", () => {
    expect(parseToken("")).toBeNull();
  });

  it("should return null for missing Bearer prefix", () => {
    expect(parseToken("ocs_acme_sk_abc123")).toBeNull();
  });

  it("should return null for missing ocs_ prefix", () => {
    expect(parseToken("Bearer acme_sk_abc123")).toBeNull();
  });

  it("should return null for malformed token", () => {
    expect(parseToken("Bearer ocs_")).toBeNull();
    expect(parseToken("Bearer ocs_acme")).toBeNull();
    expect(parseToken("Bearer ocs_acme_")).toBeNull();
  });
});

describe("parseAdminToken", () => {
  it("should parse valid admin token", () => {
    const result = parseAdminToken("Bearer admin_token_123");
    expect(result).toBe("admin_token_123");
  });

  it("should return null for missing header", () => {
    expect(parseAdminToken(undefined)).toBeNull();
  });

  it("should return null for empty header", () => {
    expect(parseAdminToken("")).toBeNull();
  });

  it("should return null for missing Bearer prefix", () => {
    expect(parseAdminToken("admin_token_123")).toBeNull();
  });
});
