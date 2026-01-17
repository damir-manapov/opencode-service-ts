import { Module } from "@nestjs/common";
import { OpencodeExecutorService } from "./opencode-executor.service.js";

@Module({
  providers: [OpencodeExecutorService],
  exports: [OpencodeExecutorService],
})
export class ExecutorModule {}
