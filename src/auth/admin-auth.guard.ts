import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import type { ConfigService } from "../config/config.service.js";
import { parseAdminToken } from "./token.utils.js";

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers["authorization"];

    const token = parseAdminToken(authHeader);
    if (!token) {
      throw new UnauthorizedException("Invalid or missing admin token");
    }

    const adminTokens = this.configService.get("adminTokens");
    if (adminTokens.length === 0) {
      throw new UnauthorizedException("No admin tokens configured");
    }

    if (!adminTokens.includes(token)) {
      throw new UnauthorizedException("Invalid admin token");
    }

    return true;
  }
}
