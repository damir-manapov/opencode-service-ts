import type { ModelConfig, ProviderConfig } from "../tenant/tenant.types.js";

export interface WorkspaceConfig {
  tenantId: string;
  sessionId?: string;
  providers: Record<string, ProviderConfig>;
  defaultModel?: ModelConfig;
  requestModel?: ModelConfig;
  tools: ToolDefinition[];
  agents: AgentDefinition[];
  secrets: Record<string, string>;
}

export interface ToolDefinition {
  name: string;
  source: string;
}

export interface AgentDefinition {
  name: string;
  content: string;
}

export interface GeneratedWorkspace {
  path: string;
  cleanup: () => Promise<void>;
}

export interface OpencodeJsonConfig {
  provider?: {
    [providerId: string]: {
      apiKey?: string;
      baseUrl?: string;
    };
  };
  model?: {
    default?: string;
  };
}
