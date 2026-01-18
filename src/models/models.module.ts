import { Module } from "@nestjs/common";
import { TenantModule } from "../tenant/tenant.module.js";
import { ModelsController } from "./models.controller.js";
import { ModelsService } from "./models.service.js";

@Module({
  imports: [TenantModule],
  controllers: [ModelsController],
  providers: [ModelsService],
  exports: [ModelsService],
})
export class ModelsModule {}
