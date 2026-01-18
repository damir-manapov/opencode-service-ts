import { Module } from "@nestjs/common";
import { WorkspaceModule } from "../workspace/workspace.module.js";
import { OpencodeExecutorService } from "./opencode-executor.service.js";

@Module({
  imports: [WorkspaceModule],
  providers: [OpencodeExecutorService],
  exports: [OpencodeExecutorService],
})
export class ExecutorModule {}
