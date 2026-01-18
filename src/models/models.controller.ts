import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { type AuthenticatedRequest, TenantAuthGuard } from "../auth/tenant-auth.guard.js";
import { ModelsService } from "./models.service.js";
import type { ModelsListResponse } from "./models.types.js";

@Controller("v1/models")
@UseGuards(TenantAuthGuard)
export class ModelsController {
  constructor(private readonly modelsService: ModelsService) {}

  /**
   * OpenAI-compatible List Models endpoint
   * GET /v1/models
   */
  @Get()
  async listModels(@Req() req: AuthenticatedRequest): Promise<ModelsListResponse> {
    return this.modelsService.listModels(req.tenant.id);
  }
}
