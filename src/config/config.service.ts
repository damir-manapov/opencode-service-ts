import { Injectable } from "@nestjs/common";

export interface Config {
  port: number;
  dataDir: string;
  predefinedDir: string;
  sessionTtl: number; // in milliseconds
  adminTokens: string[];
  allowSelfRegistration: boolean;
}

@Injectable()
export class ConfigService {
  private readonly config: Config;

  constructor() {
    this.config = {
      port: this.parsePort(),
      dataDir: process.env["DATA_DIR"] ?? "./data",
      predefinedDir: process.env["PREDEFINED_DIR"] ?? "./predefined",
      sessionTtl: this.parseSessionTtl(),
      adminTokens: this.parseAdminTokens(),
      allowSelfRegistration: process.env["ALLOW_SELF_REGISTRATION"] === "true",
    };
  }

  get<K extends keyof Config>(key: K): Config[K] {
    return this.config[key];
  }

  private parsePort(): number {
    const port = process.env["PORT"];
    if (!port) return 3001;
    const parsed = Number.parseInt(port, 10);
    if (Number.isNaN(parsed)) return 3001;
    return parsed;
  }

  private parseSessionTtl(): number {
    const ttl = process.env["SESSION_TTL"] ?? "24h";
    const match = ttl.match(/^(\d+)(m|h|d)$/);
    if (!match) {
      console.warn(`Invalid SESSION_TTL format: ${ttl}, using default 24h`);
      return 24 * 60 * 60 * 1000;
    }
    const value = Number.parseInt(match[1] ?? "24", 10);
    const unit = match[2];
    switch (unit) {
      case "m":
        return value * 60 * 1000;
      case "h":
        return value * 60 * 60 * 1000;
      case "d":
        return value * 24 * 60 * 60 * 1000;
      default:
        return 24 * 60 * 60 * 1000;
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
