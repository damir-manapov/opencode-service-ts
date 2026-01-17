import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { ConfigService } from "../config/config.service.js";
import { AdminTokenInvalidError, AdminTokenNotConfiguredError } from "../errors/index.js";
import { parseAdminToken } from "./token.utils.js";

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers["authorization"];

    const token = parseAdminToken(authHeader);
    if (!token) {
      throw new AdminTokenInvalidError();
    }

    const adminTokens = this.configService.get("adminTokens");
    if (adminTokens.length === 0) {
      throw new AdminTokenNotConfiguredError();
    }

    if (!adminTokens.includes(token)) {
      throw new AdminTokenInvalidError();
    }

    return true;
  }
}
