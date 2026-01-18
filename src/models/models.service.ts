import { Injectable } from "@nestjs/common";
import { TenantService } from "../tenant/tenant.service.js";
import { type Model, type ModelsListResponse, PROVIDER_MODELS } from "./models.types.js";

@Injectable()
export class ModelsService {
  constructor(private readonly tenantService: TenantService) {}

  async listModels(tenantId: string): Promise<ModelsListResponse> {
    const tenant = await this.tenantService.getTenant(tenantId);
    if (!tenant) {
      return { object: "list", data: [] };
    }

    const models: Model[] = [];
    const now = Math.floor(Date.now() / 1000);
    const providers = tenant.providers || {};

    for (const providerId of Object.keys(providers)) {
      const providerModels = PROVIDER_MODELS[providerId] || [];

      for (const modelId of providerModels) {
        models.push({
          id: `${providerId}/${modelId}`,
          object: "model",
          created: now,
          owned_by: providerId,
        });
      }
    }

    return {
      object: "list",
      data: models,
    };
  }
}
