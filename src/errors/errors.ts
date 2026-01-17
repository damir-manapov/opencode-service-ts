import { HttpException, HttpStatus } from "@nestjs/common";

export class TenantNotFoundError extends HttpException {
  constructor(tenantId: string) {
    super(`Tenant ${tenantId} not found`, HttpStatus.NOT_FOUND);
  }
}

export class TokenInvalidError extends HttpException {
  constructor() {
    super("Invalid or missing token", HttpStatus.UNAUTHORIZED);
  }
}

export class AdminTokenInvalidError extends HttpException {
  constructor() {
    super("Invalid or missing admin token", HttpStatus.UNAUTHORIZED);
  }
}

export class AdminTokenNotConfiguredError extends HttpException {
  constructor() {
    super("No admin tokens configured", HttpStatus.UNAUTHORIZED);
  }
}

export class ToolNotFoundError extends HttpException {
  constructor(name: string) {
    super(`Tool ${name} not found`, HttpStatus.NOT_FOUND);
  }
}

export class AgentNotFoundError extends HttpException {
  constructor(name: string) {
    super(`Agent ${name} not found`, HttpStatus.NOT_FOUND);
  }
}

export class SecretNotFoundError extends HttpException {
  constructor(name: string) {
    super(`Secret ${name} not found`, HttpStatus.NOT_FOUND);
  }
}

export class InvalidToolNameError extends HttpException {
  constructor() {
    super("Tool name must be lowercase alphanumeric with dashes", HttpStatus.BAD_REQUEST);
  }
}

export class InvalidAgentNameError extends HttpException {
  constructor() {
    super("Agent name must be lowercase alphanumeric with dashes", HttpStatus.BAD_REQUEST);
  }
}

export class InvalidSecretNameError extends HttpException {
  constructor() {
    super("Secret name must be uppercase alphanumeric with underscores", HttpStatus.BAD_REQUEST);
  }
}
