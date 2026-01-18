import {
  BadRequestException,
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
import { formatZodError } from "../common/validation.utils.js";
import { TenantNotFoundError } from "../errors/index.js";
import { TenantService } from "../tenant/tenant.service.js";
import type { SanitizedTenant, SanitizedTenantWithTokens } from "../tenant/tenant.utils.js";
import { sanitizeTenant, sanitizeTenantWithTokens } from "../tenant/tenant.utils.js";
import { CreateTenantInputSchema } from "./admin.schema.js";

interface CreateTenantResponse {
  tenant: SanitizedTenant;
  token: string;
}

interface TenantListResponse {
  tenants: SanitizedTenant[];
}

interface TenantResponse {
  tenant: SanitizedTenantWithTokens;
}

@Controller("v1/admin/tenants")
@UseGuards(AdminAuthGuard)
export class AdminController {
  constructor(private readonly tenantService: TenantService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createTenant(@Body() body: unknown): Promise<CreateTenantResponse> {
    const parseResult = CreateTenantInputSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(formatZodError(parseResult.error));
    }

    const { tenant, token } = await this.tenantService.createTenant(parseResult.data);
    return {
      tenant: sanitizeTenant(tenant),
      token,
    };
  }

  @Get()
  async listTenants(): Promise<TenantListResponse> {
    const tenants = await this.tenantService.listTenants();
    return {
      tenants: tenants.map((t) => sanitizeTenant(t)),
    };
  }

  @Get(":id")
  async getTenant(@Param("id") id: string): Promise<TenantResponse> {
    const tenant = await this.tenantService.getTenant(id);
    if (!tenant) {
      throw new TenantNotFoundError(id);
    }
    return {
      tenant: sanitizeTenantWithTokens(tenant),
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
}
