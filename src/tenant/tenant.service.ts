import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Injectable, type OnModuleInit } from "@nestjs/common";
import type { ConfigService } from "../config/config.service.js";
import type { CreateTenantInput, TenantConfig } from "./tenant.types.js";

@Injectable()
export class TenantService implements OnModuleInit {
  private tenantsDir: string;

  constructor(private readonly configService: ConfigService) {
    this.tenantsDir = join(this.configService.get("dataDir"), "tenants");
  }

  async onModuleInit(): Promise<void> {
    await mkdir(this.tenantsDir, { recursive: true });
  }

  async createTenant(input: CreateTenantInput): Promise<{ tenant: TenantConfig; token: string }> {
    const id = input.id ?? this.generateId();
    const token = this.generateToken(id);
    const now = new Date().toISOString();

    const tenant: TenantConfig = {
      id,
      name: input.name,
      tokens: [token],
      providers: input.providers,
      defaultModel: input.defaultModel,
      secrets: {},
      createdAt: now,
      updatedAt: now,
    };

    await this.saveTenant(tenant);
    return { tenant, token };
  }

  async getTenant(id: string): Promise<TenantConfig | null> {
    try {
      const filePath = this.getTenantFilePath(id);
      const data = await readFile(filePath, "utf-8");
      return JSON.parse(data) as TenantConfig;
    } catch {
      return null;
    }
  }

  async listTenants(): Promise<TenantConfig[]> {
    try {
      const files = await readdir(this.tenantsDir);
      const tenants: TenantConfig[] = [];
      for (const file of files) {
        if (file.endsWith(".json")) {
          const id = file.replace(".json", "");
          const tenant = await this.getTenant(id);
          if (tenant) {
            tenants.push(tenant);
          }
        }
      }
      return tenants;
    } catch {
      return [];
    }
  }

  async updateTenant(id: string, updates: Partial<TenantConfig>): Promise<TenantConfig | null> {
    const tenant = await this.getTenant(id);
    if (!tenant) return null;

    const updated: TenantConfig = {
      ...tenant,
      ...updates,
      id, // prevent id change
      updatedAt: new Date().toISOString(),
    };

    await this.saveTenant(updated);
    return updated;
  }

  async deleteTenant(id: string): Promise<boolean> {
    try {
      const filePath = this.getTenantFilePath(id);
      await unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async addToken(id: string): Promise<string | null> {
    const tenant = await this.getTenant(id);
    if (!tenant) return null;

    const token = this.generateToken(id);
    tenant.tokens.push(token);
    tenant.updatedAt = new Date().toISOString();

    await this.saveTenant(tenant);
    return token;
  }

  async revokeToken(id: string, token: string): Promise<boolean> {
    const tenant = await this.getTenant(id);
    if (!tenant) return false;

    const index = tenant.tokens.indexOf(token);
    if (index === -1) return false;

    tenant.tokens.splice(index, 1);
    tenant.updatedAt = new Date().toISOString();

    await this.saveTenant(tenant);
    return true;
  }

  // Tools
  async listTools(tenantId: string): Promise<string[]> {
    const toolsDir = this.getToolsDir(tenantId);
    try {
      const files = await readdir(toolsDir);
      return files.filter((f) => f.endsWith(".ts")).map((f) => f.replace(".ts", ""));
    } catch {
      return [];
    }
  }

  async getTool(tenantId: string, name: string): Promise<string | null> {
    try {
      const filePath = join(this.getToolsDir(tenantId), `${name}.ts`);
      return await readFile(filePath, "utf-8");
    } catch {
      return null;
    }
  }

  async saveTool(tenantId: string, name: string, content: string): Promise<void> {
    const toolsDir = this.getToolsDir(tenantId);
    await mkdir(toolsDir, { recursive: true });
    await writeFile(join(toolsDir, `${name}.ts`), content, "utf-8");
  }

  async deleteTool(tenantId: string, name: string): Promise<boolean> {
    try {
      await unlink(join(this.getToolsDir(tenantId), `${name}.ts`));
      return true;
    } catch {
      return false;
    }
  }

  // Agents
  async listAgents(tenantId: string): Promise<string[]> {
    const agentsDir = this.getAgentsDir(tenantId);
    try {
      const files = await readdir(agentsDir);
      return files.filter((f) => f.endsWith(".md")).map((f) => f.replace(".md", ""));
    } catch {
      return [];
    }
  }

  async getAgent(tenantId: string, name: string): Promise<string | null> {
    try {
      const filePath = join(this.getAgentsDir(tenantId), `${name}.md`);
      return await readFile(filePath, "utf-8");
    } catch {
      return null;
    }
  }

  async saveAgent(tenantId: string, name: string, content: string): Promise<void> {
    const agentsDir = this.getAgentsDir(tenantId);
    await mkdir(agentsDir, { recursive: true });
    await writeFile(join(agentsDir, `${name}.md`), content, "utf-8");
  }

  async deleteAgent(tenantId: string, name: string): Promise<boolean> {
    try {
      await unlink(join(this.getAgentsDir(tenantId), `${name}.md`));
      return true;
    } catch {
      return false;
    }
  }

  // Secrets
  async setSecret(tenantId: string, name: string, value: string): Promise<void> {
    const tenant = await this.getTenant(tenantId);
    if (!tenant) return;

    tenant.secrets = tenant.secrets ?? {};
    tenant.secrets[name] = value;
    tenant.updatedAt = new Date().toISOString();

    await this.saveTenant(tenant);
  }

  async deleteSecret(tenantId: string, name: string): Promise<boolean> {
    const tenant = await this.getTenant(tenantId);
    if (!tenant || !tenant.secrets?.[name]) return false;

    delete tenant.secrets[name];
    tenant.updatedAt = new Date().toISOString();

    await this.saveTenant(tenant);
    return true;
  }

  private async saveTenant(tenant: TenantConfig): Promise<void> {
    const filePath = this.getTenantFilePath(tenant.id);
    await writeFile(filePath, JSON.stringify(tenant, null, 2), "utf-8");
  }

  private getTenantFilePath(id: string): string {
    return join(this.tenantsDir, `${id}.json`);
  }

  private getToolsDir(tenantId: string): string {
    return join(this.tenantsDir, tenantId, "tools");
  }

  private getAgentsDir(tenantId: string): string {
    return join(this.tenantsDir, tenantId, "agents");
  }

  private generateId(): string {
    return randomBytes(8).toString("hex");
  }

  private generateToken(tenantId: string): string {
    const secret = `sk_${randomBytes(16).toString("hex")}`;
    return `ocs_${tenantId}_${secret}`;
  }
}
