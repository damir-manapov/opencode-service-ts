import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { type AuthenticatedRequest, TenantAuthGuard } from "../auth/tenant-auth.guard.js";
import { formatZodError } from "../common/validation.utils.js";
import {
  AgentNotFoundError,
  InvalidAgentNameError,
  InvalidSecretNameError,
  InvalidToolNameError,
  SecretNotFoundError,
  TenantNotFoundError,
  ToolNotFoundError,
} from "../errors/index.js";
import {
  ResourceNameSchema,
  SecretNameSchema,
  SecretValueSchema,
  UpdateConfigInputSchema,
} from "./tenant.schema.js";
import { TenantService } from "./tenant.service.js";
import type { ModelConfig, TenantConfig } from "./tenant.types.js";

interface TenantConfigResponse {
  id: string;
  name: string;
  providers: Record<string, { configured: boolean }>;
  defaultModel?: ModelConfig;
  tools: string[];
  agents: string[];
  secrets: string[];
}

@Controller("v1/tenant")
@UseGuards(TenantAuthGuard)
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get("config")
  async getConfig(@Req() req: AuthenticatedRequest): Promise<TenantConfigResponse> {
    const tenant = req.tenant.config;
    return this.toConfigResponse(tenant);
  }

  @Put("config")
  async updateConfig(
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<TenantConfigResponse> {
    const parseResult = UpdateConfigInputSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(formatZodError(parseResult.error));
    }
    const input = parseResult.data;

    const updated = await this.tenantService.updateTenant(req.tenant.id, {
      name: input.name,
      providers: input.providers,
      defaultModel: input.defaultModel,
    });
    if (!updated) {
      throw new TenantNotFoundError(req.tenant.id);
    }
    return this.toConfigResponse(updated);
  }

  // Tools
  @Get("tools")
  async listTools(@Req() req: AuthenticatedRequest): Promise<{ tools: string[] }> {
    const tools = await this.tenantService.listTools(req.tenant.id);
    return { tools };
  }

  @Get("tools/:name")
  async getTool(@Req() req: AuthenticatedRequest, @Param("name") name: string): Promise<string> {
    const tool = await this.tenantService.getTool(req.tenant.id, name);
    if (!tool) {
      throw new ToolNotFoundError(name);
    }
    return tool;
  }

  @Put("tools/:name")
  @HttpCode(HttpStatus.OK)
  async putTool(
    @Req() req: AuthenticatedRequest,
    @Param("name") name: string,
    @Body() body: string,
  ): Promise<{ name: string }> {
    const parseResult = ResourceNameSchema.safeParse(name);
    if (!parseResult.success) {
      throw new InvalidToolNameError();
    }
    await this.tenantService.saveTool(req.tenant.id, name, body);
    return { name };
  }

  @Delete("tools/:name")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTool(@Req() req: AuthenticatedRequest, @Param("name") name: string): Promise<void> {
    const deleted = await this.tenantService.deleteTool(req.tenant.id, name);
    if (!deleted) {
      throw new ToolNotFoundError(name);
    }
  }

  // Agents
  @Get("agents")
  async listAgents(@Req() req: AuthenticatedRequest): Promise<{ agents: string[] }> {
    const agents = await this.tenantService.listAgents(req.tenant.id);
    return { agents };
  }

  @Get("agents/:name")
  async getAgent(@Req() req: AuthenticatedRequest, @Param("name") name: string): Promise<string> {
    const agent = await this.tenantService.getAgent(req.tenant.id, name);
    if (!agent) {
      throw new AgentNotFoundError(name);
    }
    return agent;
  }

  @Put("agents/:name")
  @HttpCode(HttpStatus.OK)
  async putAgent(
    @Req() req: AuthenticatedRequest,
    @Param("name") name: string,
    @Body() body: string,
  ): Promise<{ name: string }> {
    const parseResult = ResourceNameSchema.safeParse(name);
    if (!parseResult.success) {
      throw new InvalidAgentNameError();
    }
    await this.tenantService.saveAgent(req.tenant.id, name, body);
    return { name };
  }

  @Delete("agents/:name")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAgent(@Req() req: AuthenticatedRequest, @Param("name") name: string): Promise<void> {
    const deleted = await this.tenantService.deleteAgent(req.tenant.id, name);
    if (!deleted) {
      throw new AgentNotFoundError(name);
    }
  }

  // Secrets
  @Get("secrets")
  async listSecrets(@Req() req: AuthenticatedRequest): Promise<{ secrets: string[] }> {
    const tenant = req.tenant.config;
    return { secrets: Object.keys(tenant.secrets ?? {}) };
  }

  @Put("secrets/:name")
  @HttpCode(HttpStatus.OK)
  async putSecret(
    @Req() req: AuthenticatedRequest,
    @Param("name") name: string,
    @Body() body: unknown,
  ): Promise<{ name: string }> {
    const nameResult = SecretNameSchema.safeParse(name);
    if (!nameResult.success) {
      throw new InvalidSecretNameError();
    }
    const bodyResult = SecretValueSchema.safeParse(body);
    if (!bodyResult.success) {
      throw new BadRequestException(formatZodError(bodyResult.error));
    }
    await this.tenantService.setSecret(req.tenant.id, name, bodyResult.data.value);
    return { name };
  }

  @Delete("secrets/:name")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSecret(@Req() req: AuthenticatedRequest, @Param("name") name: string): Promise<void> {
    const deleted = await this.tenantService.deleteSecret(req.tenant.id, name);
    if (!deleted) {
      throw new SecretNotFoundError(name);
    }
  }

  private toConfigResponse(tenant: TenantConfig): TenantConfigResponse {
    const providers: Record<string, { configured: boolean }> = {};
    for (const [key] of Object.entries(tenant.providers ?? {})) {
      providers[key] = { configured: true };
    }

    return {
      id: tenant.id,
      name: tenant.name,
      providers,
      defaultModel: tenant.defaultModel,
      tools: [], // Will be filled by listTools
      agents: [], // Will be filled by listAgents
      secrets: Object.keys(tenant.secrets ?? {}),
    };
  }
}
