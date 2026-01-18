import { Module } from "@nestjs/common";
import { AdminModule } from "./admin/index.js";
import { AuthModule } from "./auth/index.js";
import { ChatModule } from "./chat/index.js";
import { ConfigModule } from "./config/index.js";
import { DataModule } from "./data/index.js";
import { HealthController } from "./health/health.controller.js";
import { ModelsModule } from "./models/index.js";
import { TenantModule } from "./tenant/index.js";

@Module({
  imports: [ConfigModule, DataModule, AuthModule, TenantModule, AdminModule, ChatModule, ModelsModule],
  controllers: [HealthController],
})
export class AppModule {}
