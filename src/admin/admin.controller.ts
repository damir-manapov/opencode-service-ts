import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AdminAuthGuard } from "../auth/admin-auth.guard.js";
import { TenantNotFoundError } from "../errors/index.js";
import type { TenantService } from "../tenant/tenant.service.js";
import type { CreateTenantInput, TenantConfig } from "../tenant/tenant.types.js";

interface CreateTenantResponse {
  tenant: Omit<TenantConfig, "tokens" | "secrets">;
  token: string;
}

interface TenantListResponse {
  tenants: Omit<TenantConfig, "tokens" | "secrets">[];
}

interface TenantResponse {
  tenant: Omit<TenantConfig, "secrets">;
}

@Controller("v1/admin/tenants")
@UseGuards(AdminAuthGuard)
export class AdminController {
  constructor(private readonly tenantService: TenantService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createTenant(@Body() input: CreateTenantInput): Promise<CreateTenantResponse> {
    const { tenant, token } = await this.tenantService.createTenant(input);
    return {
      tenant: this.sanitizeTenant(tenant),
      token,
    };
  }

  @Get()
  async listTenants(): Promise<TenantListResponse> {
    const tenants = await this.tenantService.listTenants();
    return {
      tenants: tenants.map((t) => this.sanitizeTenant(t)),
    };
  }

  @Get(":id")
  async getTenant(@Param("id") id: string): Promise<TenantResponse> {
    const tenant = await this.tenantService.getTenant(id);
    if (!tenant) {
      throw new TenantNotFoundError(id);
    }
    return {
      tenant: this.sanitizeTenantWithTokens(tenant),
    };
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTenant(@Param("id") id: string): Promise<void> {
    const deleted = await this.tenantService.deleteTenant(id);
    if (!deleted) {
      throw new TenantNotFoundError(id);
    }
  }

  private sanitizeTenant(tenant: TenantConfig): Omit<TenantConfig, "tokens" | "secrets"> {
    const { tokens: _tokens, secrets: _secrets, ...rest } = tenant;
    return rest;
  }

  private sanitizeTenantWithTokens(tenant: TenantConfig): Omit<TenantConfig, "secrets"> {
    const { secrets: _secrets, ...rest } = tenant;
    return rest;
  }
}
