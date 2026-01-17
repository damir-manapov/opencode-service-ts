export interface ProviderConfig {
  apiKey: string;
}

export interface ModelConfig {
  providerId: string;
  modelId: string;
}

export interface TenantConfig {
  id: string;
  name: string;
  tokens: string[];
  providers: Record<string, ProviderConfig>;
  defaultModel?: ModelConfig;
  secrets?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTenantInput {
  id?: string;
  name: string;
  providers: Record<string, ProviderConfig>;
  defaultModel?: ModelConfig;
}
