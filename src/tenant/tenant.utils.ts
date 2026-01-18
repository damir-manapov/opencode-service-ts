import type { TenantConfig } from "./tenant.types.js";

/**
 * Response type without tokens and secrets (for list/create operations)
 */
export type SanitizedTenant = Omit<TenantConfig, "tokens" | "secrets">;

/**
 * Response type without secrets but with tokens (for get by id)
 */
export type SanitizedTenantWithTokens = Omit<TenantConfig, "secrets">;

/**
 * Remove tokens and secrets from tenant config (for list/create responses)
 */
export function sanitizeTenant(tenant: TenantConfig): SanitizedTenant {
  const { tokens: _tokens, secrets: _secrets, ...rest } = tenant;
  return rest;
}

/**
 * Remove only secrets from tenant config (for detailed get responses)
 */
export function sanitizeTenantWithTokens(tenant: TenantConfig): SanitizedTenantWithTokens {
  const { secrets: _secrets, ...rest } = tenant;
  return rest;
}
