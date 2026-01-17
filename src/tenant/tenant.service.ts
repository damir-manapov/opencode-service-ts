import { randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  AGENT_REPOSITORY,
  type AgentRepository,
  TENANT_REPOSITORY,
  type TenantRepository,
  TOOL_REPOSITORY,
  type ToolRepository,
} from "../data/index.js";
import type { CreateTenantInput, TenantConfig } from "./tenant.types.js";

@Injectable()
export class TenantService {
  constructor(
    @Inject(TENANT_REPOSITORY) private readonly tenantRepo: TenantRepository,
    @Inject(TOOL_REPOSITORY) private readonly toolRepo: ToolRepository,
    @Inject(AGENT_REPOSITORY) private readonly agentRepo: AgentRepository,
  ) {}

  async createTenant(input: CreateTenantInput): Promise<{ tenant: TenantConfig; token: string }> {
    const id = this.generateId();
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

    await this.tenantRepo.save(tenant);
    return { tenant, token };
  }

  async getTenant(id: string): Promise<TenantConfig | null> {
    return this.tenantRepo.get(id);
  }

  async listTenants(): Promise<TenantConfig[]> {
    return this.tenantRepo.list();
  }

  async updateTenant(id: string, updates: Partial<TenantConfig>): Promise<TenantConfig | null> {
    const tenant = await this.tenantRepo.get(id);
    if (!tenant) return null;

    const updated: TenantConfig = {
      ...tenant,
      ...updates,
      id, // prevent id change
      updatedAt: new Date().toISOString(),
    };

    await this.tenantRepo.save(updated);
    return updated;
  }

  async deleteTenant(id: string): Promise<boolean> {
    return this.tenantRepo.delete(id);
  }

  async addToken(id: string): Promise<string | null> {
    const tenant = await this.tenantRepo.get(id);
    if (!tenant) return null;

    const token = this.generateToken(id);
    tenant.tokens.push(token);
    tenant.updatedAt = new Date().toISOString();

    await this.tenantRepo.save(tenant);
    return token;
  }

  async revokeToken(id: string, token: string): Promise<boolean> {
    const tenant = await this.tenantRepo.get(id);
    if (!tenant) return false;

    const index = tenant.tokens.indexOf(token);
    if (index === -1) return false;

    tenant.tokens.splice(index, 1);
    tenant.updatedAt = new Date().toISOString();

    await this.tenantRepo.save(tenant);
    return true;
  }

  // Tools
  async listTools(tenantId: string): Promise<string[]> {
    return this.toolRepo.list(tenantId);
  }

  async getTool(tenantId: string, name: string): Promise<string | null> {
    return this.toolRepo.get(tenantId, name);
  }

  async saveTool(tenantId: string, name: string, content: string): Promise<void> {
    await this.toolRepo.save(tenantId, name, content);
  }

  async deleteTool(tenantId: string, name: string): Promise<boolean> {
    return this.toolRepo.delete(tenantId, name);
  }

  // Agents
  async listAgents(tenantId: string): Promise<string[]> {
    return this.agentRepo.list(tenantId);
  }

  async getAgent(tenantId: string, name: string): Promise<string | null> {
    return this.agentRepo.get(tenantId, name);
  }

  async saveAgent(tenantId: string, name: string, content: string): Promise<void> {
    await this.agentRepo.save(tenantId, name, content);
  }

  async deleteAgent(tenantId: string, name: string): Promise<boolean> {
    return this.agentRepo.delete(tenantId, name);
  }

  // Secrets (stored in tenant config)
  async setSecret(tenantId: string, name: string, value: string): Promise<void> {
    const tenant = await this.tenantRepo.get(tenantId);
    if (!tenant) return;

    tenant.secrets = tenant.secrets ?? {};
    tenant.secrets[name] = value;
    tenant.updatedAt = new Date().toISOString();

    await this.tenantRepo.save(tenant);
  }

  async deleteSecret(tenantId: string, name: string): Promise<boolean> {
    const tenant = await this.tenantRepo.get(tenantId);
    if (!tenant || !tenant.secrets?.[name]) return false;

    delete tenant.secrets[name];
    tenant.updatedAt = new Date().toISOString();

    await this.tenantRepo.save(tenant);
    return true;
  }

  private generateId(): string {
    return randomBytes(8).toString("hex");
  }

  private generateToken(tenantId: string): string {
    const secret = `sk_${randomBytes(16).toString("hex")}`;
    return `ocs_${tenantId}_${secret}`;
  }
}
