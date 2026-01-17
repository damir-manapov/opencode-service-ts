import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { TenantNotFoundError, TokenInvalidError } from "../errors/index.js";
import type { TenantService } from "../tenant/tenant.service.js";
import type { TenantConfig } from "../tenant/tenant.types.js";
import { type ParsedToken, parseToken } from "./token.utils.js";

export interface AuthenticatedRequest extends Request {
  tenant: {
    id: string;
    config: TenantConfig;
  };
}

@Injectable()
export class TenantAuthGuard implements CanActivate {
  constructor(private readonly tenantService: TenantService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers["authorization"];

    const parsed = parseToken(authHeader);
    if (!parsed) {
      throw new TokenInvalidError();
    }

    const tenant = await this.tenantService.getTenant(parsed.tenantId);
    if (!tenant) {
      throw new TenantNotFoundError(parsed.tenantId);
    }

    if (!this.validateToken(tenant.tokens, parsed)) {
      throw new TokenInvalidError();
    }

    (request as AuthenticatedRequest).tenant = {
      id: parsed.tenantId,
      config: tenant,
    };

    return true;
  }

  private validateToken(tokens: string[], parsed: ParsedToken): boolean {
    const fullToken = `ocs_${parsed.tenantId}_${parsed.secret}`;
    return tokens.includes(fullToken);
  }
}
