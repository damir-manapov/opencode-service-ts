import { Module } from "@nestjs/common";
import { TenantModule } from "../tenant/index.js";
import { AdminController } from "./admin.controller.js";

@Module({
  imports: [TenantModule],
  controllers: [AdminController],
})
export class AdminModule {}
