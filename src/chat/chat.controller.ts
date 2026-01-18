import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { type AuthenticatedRequest, TenantAuthGuard } from "../auth/tenant-auth.guard.js";
import { formatZodError } from "../common/validation.utils.js";
import { ChatCompletionRequestSchema } from "./chat.schema.js";
import { ChatService } from "./chat.service.js";
import type { ChatCompletionResponse } from "./chat.types.js";

@Controller("v1/chat")
@UseGuards(TenantAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * OpenAI-compatible Chat Completions endpoint
   * POST /v1/chat/completions
   */
  @Post("completions")
  @HttpCode(HttpStatus.OK)
  async chatCompletions(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
    @Body() body: unknown,
  ): Promise<ChatCompletionResponse | undefined> {
    // Validate request body with Zod
    const parseResult = ChatCompletionRequestSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(formatZodError(parseResult.error));
    }
    const validatedBody = parseResult.data;

    const tenantId = req.tenant.id;

    if (validatedBody.stream) {
      // Streaming response (SSE)
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      try {
        for await (const chunk of this.chatService.chatCompletionsStreaming(
          tenantId,
          validatedBody,
        )) {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
        res.write("data: [DONE]\n\n");
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        res.write(
          `data: ${JSON.stringify({ error: { message: errorMessage, type: "server_error" } })}\n\n`,
        );
      } finally {
        res.end();
      }
      return;
    }

    // Non-streaming response
    try {
      return await this.chatService.chatCompletions(tenantId, validatedBody);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      // Return OpenAI-compatible error response
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: {
          message: errorMessage,
          type: "server_error",
          code: this.extractErrorCode(error),
        },
      });
      return;
    }
  }

  /**
   * Extract error code from error object if available
   */
  private extractErrorCode(error: unknown): string | undefined {
    if (error instanceof Error) {
      // Check if error message contains a code (e.g., "insufficient_quota")
      const codeMatch =
        error.message.match(/"code"\s*:\s*"([^"]+)"/) ||
        error.message.match(/"type"\s*:\s*"([^"]+)"/);
      if (codeMatch) {
        return codeMatch[1];
      }
    }
    return undefined;
  }
}
