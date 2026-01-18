import { Injectable } from "@nestjs/common";

export const CONFIG_DEFAULTS = {
  PORT: 3000,
  DATA_DIR: "./data",
  PREDEFINED_DIR: "./predefined",
  IDLE_TIMEOUT: "5m",
  IDLE_TIMEOUT_MS: 5 * 60 * 1000,
} as const;

export interface Config {
  port: number;
  dataDir: string;
  predefinedDir: string;
  idleTimeout: number; // in milliseconds - OpenCode instance idle timeout
  adminTokens: string[];
  allowSelfRegistration: boolean;
}

@Injectable()
export class ConfigService {
  private readonly config: Config;

  constructor() {
    this.config = {
      port: this.parsePort(),
      dataDir: process.env["DATA_DIR"] ?? CONFIG_DEFAULTS.DATA_DIR,
      predefinedDir: process.env["PREDEFINED_DIR"] ?? CONFIG_DEFAULTS.PREDEFINED_DIR,
      idleTimeout: this.parseDuration(
        "IDLE_TIMEOUT",
        CONFIG_DEFAULTS.IDLE_TIMEOUT,
        CONFIG_DEFAULTS.IDLE_TIMEOUT_MS,
      ),
      adminTokens: this.parseAdminTokens(),
      allowSelfRegistration: process.env["ALLOW_SELF_REGISTRATION"] === "true",
    };
  }

  get<K extends keyof Config>(key: K): Config[K] {
    return this.config[key];
  }

  private parsePort(): number {
    const port = process.env["PORT"];
    if (!port) return CONFIG_DEFAULTS.PORT;
    const parsed = Number.parseInt(port, 10);
    if (Number.isNaN(parsed)) return CONFIG_DEFAULTS.PORT;
    return parsed;
  }

  private parseDuration(envKey: string, defaultValue: string, defaultMs: number): number {
    const value = process.env[envKey] ?? defaultValue;
    const match = value.match(/^(\d+)(m|h|d)$/);
    if (!match) {
      console.warn(`Invalid ${envKey} format: ${value}, using default ${defaultValue}`);
      return defaultMs;
    }
    const num = Number.parseInt(match[1] ?? "0", 10);
    const unit = match[2];
    switch (unit) {
      case "m":
        return num * 60 * 1000;
      case "h":
        return num * 60 * 60 * 1000;
      case "d":
        return num * 24 * 60 * 60 * 1000;
      default:
        return defaultMs;
    }
  }

  private parseAdminTokens(): string[] {
    const tokens = process.env["ADMIN_TOKENS"];
    if (!tokens) return [];
    return tokens
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
}
