import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { type AuthenticatedRequest, TenantAuthGuard } from "../auth/tenant-auth.guard.js";
import { ChatService } from "./chat.service.js";
import type { ChatRequest, ChatResponse } from "./chat.types.js";

@Controller("v1/chat")
@UseGuards(TenantAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async chat(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
    @Body() body: ChatRequest,
  ): Promise<ChatResponse | undefined> {
    const tenantId = req.tenant.id;

    if (body.stream) {
      // Streaming response
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      try {
        for await (const chunk of this.chatService.chatStreaming(tenantId, body)) {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
        res.write("data: [DONE]\n\n");
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        res.write(`data: ${JSON.stringify({ type: "error", error: errorMessage })}\n\n`);
      } finally {
        res.end();
      }
      return;
    }

    // Non-streaming response
    return this.chatService.chat(tenantId, body);
  }
}
