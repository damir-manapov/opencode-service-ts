import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import type { Response } from "express";

/**
 * OpenAI-compatible error response format
 */
interface OpenAIErrorResponse {
  error: {
    message: string;
    type: string;
    param: string | null;
    code: string | null;
  };
}

/**
 * Maps HTTP status codes to OpenAI error types
 */
function getErrorType(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return "invalid_request_error";
    case HttpStatus.UNAUTHORIZED:
      return "authentication_error";
    case HttpStatus.FORBIDDEN:
      return "permission_error";
    case HttpStatus.NOT_FOUND:
      return "not_found_error";
    case HttpStatus.TOO_MANY_REQUESTS:
      return "rate_limit_error";
    case HttpStatus.INTERNAL_SERVER_ERROR:
    default:
      return "server_error";
  }
}

/**
 * Extracts error code from error message if present
 */
function extractErrorCode(message: string): string | null {
  const codeMatch =
    message.match(/"code"\s*:\s*"([^"]+)"/) || message.match(/"type"\s*:\s*"([^"]+)"/);
  return codeMatch?.[1] ?? null;
}

/**
 * Extracts param name from validation error message
 */
function extractParam(message: string): string | null {
  // Match patterns like "model: is required" or "messages: array must not be empty"
  const match = message.match(/^([a-z_]+):/i);
  return match?.[1] ?? null;
}

/**
 * Exception filter that transforms all errors to OpenAI-compatible format
 * Apply this to chat endpoints for OpenAI SDK compatibility
 */
@Catch()
export class OpenAIErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = "An unexpected error occurred";

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === "string") {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === "object" && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp.message as string) || (resp.error as string) || message;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const errorResponse: OpenAIErrorResponse = {
      error: {
        message,
        type: getErrorType(status),
        param: extractParam(message),
        code: extractErrorCode(message),
      },
    };

    response.status(status).json(errorResponse);
  }
}
