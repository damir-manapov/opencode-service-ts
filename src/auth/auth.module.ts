import { Module } from "@nestjs/common";
import { TenantModule } from "../tenant/tenant.module.js";
import { AdminAuthGuard } from "./admin-auth.guard.js";
import { TenantAuthGuard } from "./tenant-auth.guard.js";

@Module({
  imports: [TenantModule],
  providers: [TenantAuthGuard, AdminAuthGuard],
  exports: [TenantAuthGuard, AdminAuthGuard],
})
export class AuthModule {}
