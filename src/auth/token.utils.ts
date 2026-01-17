export interface ParsedToken {
  tenantId: string;
  secret: string;
}

export function parseToken(authHeader: string | undefined): ParsedToken | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer ocs_([^_]+)_(.+)$/);
  if (!match) return null;
  const tenantId = match[1];
  const secret = match[2];
  if (!tenantId || !secret) return null;
  return { tenantId, secret };
}

export function parseAdminToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) return null;
  return match[1] ?? null;
}
