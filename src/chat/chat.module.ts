import { Module } from "@nestjs/common";
import { ExecutorModule } from "../executor/executor.module.js";
import { TenantModule } from "../tenant/tenant.module.js";
import { WorkspaceModule } from "../workspace/workspace.module.js";
import { ChatController } from "./chat.controller.js";
import { ChatService } from "./chat.service.js";

@Module({
  imports: [TenantModule, WorkspaceModule, ExecutorModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
