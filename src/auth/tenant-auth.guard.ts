import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
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
      throw new UnauthorizedException("Invalid or missing token");
    }

    const tenant = await this.tenantService.getTenant(parsed.tenantId);
    if (!tenant) {
      throw new UnauthorizedException("Tenant not found");
    }

    if (!this.validateToken(tenant.tokens, parsed)) {
      throw new UnauthorizedException("Invalid token");
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
