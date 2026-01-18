import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { TenantNotFoundError } from "../errors/index.js";
import { OpencodeExecutorService } from "../executor/opencode-executor.service.js";
import { TenantService } from "../tenant/tenant.service.js";
import type { TenantConfig } from "../tenant/tenant.types.js";
import type {
  AgentDefinition,
  ToolDefinition,
  WorkspaceConfig,
} from "../workspace/workspace.types.js";
import type {
  ChatCompletionChunk,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ModelSelection,
} from "./chat.types.js";

interface RequestContext {
  tenant: TenantConfig;
  modelSelection: ModelSelection;
  workspaceConfig: WorkspaceConfig;
  providerCredentials: Record<string, string>;
}

@Injectable()
export class ChatService {
  constructor(
    private readonly tenantService: TenantService,
    private readonly executorService: OpencodeExecutorService,
  ) {}

  /**
   * Build common request context (tenant, model, workspace config, credentials)
   */
  private async buildContext(
    tenantId: string,
    request: ChatCompletionRequest,
  ): Promise<RequestContext> {
    const tenant = await this.tenantService.getTenant(tenantId);
    if (!tenant) {
      throw new TenantNotFoundError(tenantId);
    }

    const modelSelection = this.parseModel(request.model, tenant);
    const tools = await this.collectTools(tenantId);
    const agents = await this.collectAgents(tenantId);

    const workspaceConfig: WorkspaceConfig = {
      tenantId,
      providers: tenant.providers,
      defaultModel: tenant.defaultModel,
      requestModel: modelSelection,
      tools,
      agents,
      secrets: tenant.secrets ?? {},
    };

    const providerCredentials: Record<string, string> = {};
    for (const [providerId, config] of Object.entries(tenant.providers)) {
      providerCredentials[providerId] = config.apiKey;
    }

    return { tenant, modelSelection, workspaceConfig, providerCredentials };
  }

  /**
   * Process a chat completion request (non-streaming)
   */
  async chatCompletions(
    tenantId: string,
    request: ChatCompletionRequest,
  ): Promise<ChatCompletionResponse> {
    const ctx = await this.buildContext(tenantId, request);

    const result = await this.executorService.execute({
      tenantId,
      workspaceConfig: ctx.workspaceConfig,
      messages: request.messages,
      model: ctx.modelSelection,
      providerCredentials: ctx.providerCredentials,
    });

    const completionId = `chatcmpl-${randomUUID()}`;
    const hasToolCalls = result.toolCalls.length > 0;

    return {
      id: completionId,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: request.model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: hasToolCalls ? null : result.content,
            tool_calls: hasToolCalls
              ? result.toolCalls.map((tc) => ({
                  id: `call_${randomUUID().slice(0, 8)}`,
                  type: "function" as const,
                  function: {
                    name: tc.name,
                    arguments: JSON.stringify(tc.input),
                  },
                }))
              : undefined,
          },
          finish_reason: hasToolCalls ? "tool_calls" : "stop",
        },
      ],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    };
  }

  /**
   * Process a chat completion request with streaming response
   */
  async *chatCompletionsStreaming(
    tenantId: string,
    request: ChatCompletionRequest,
  ): AsyncGenerator<ChatCompletionChunk, void, undefined> {
    const ctx = await this.buildContext(tenantId, request);
    const completionId = `chatcmpl-${randomUUID()}`;
    const created = Math.floor(Date.now() / 1000);

    yield {
      id: completionId,
      object: "chat.completion.chunk",
      created,
      model: request.model,
      choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
    };

    for await (const chunk of this.executorService.executeStreaming({
      tenantId,
      workspaceConfig: ctx.workspaceConfig,
      messages: request.messages,
      model: ctx.modelSelection,
      providerCredentials: ctx.providerCredentials,
    })) {
      if (chunk.type === "text" && chunk.content) {
        yield {
          id: completionId,
          object: "chat.completion.chunk",
          created,
          model: request.model,
          choices: [{ index: 0, delta: { content: chunk.content }, finish_reason: null }],
        };
      } else if (chunk.type === "done") {
        yield {
          id: completionId,
          object: "chat.completion.chunk",
          created,
          model: request.model,
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        };
      }
    }
  }

  /**
   * Parse model string to internal ModelSelection format
   * Supports: provider/model, provider/model@agent, model, model@agent
   */
  private parseModel(model: string, tenant: TenantConfig): ModelSelection {
    // Extract agent if present (model@agent syntax)
    let agentId: string | undefined;
    let modelPart = model;

    if (model.includes("@")) {
      const atIndex = model.lastIndexOf("@");
      modelPart = model.substring(0, atIndex);
      agentId = model.substring(atIndex + 1);
    }

    if (modelPart.includes("/")) {
      const slashIndex = modelPart.indexOf("/");
      return {
        providerId: modelPart.substring(0, slashIndex),
        modelId: modelPart.substring(slashIndex + 1),
        agentId,
      };
    }

    if (tenant.defaultModel) {
      return { providerId: tenant.defaultModel.providerId, modelId: modelPart, agentId };
    }

    const firstProvider = Object.keys(tenant.providers)[0];
    return { providerId: firstProvider ?? "", modelId: modelPart, agentId };
  }

  private async collectTools(tenantId: string): Promise<ToolDefinition[]> {
    const toolNames = await this.tenantService.listTools(tenantId);
    const tools: ToolDefinition[] = [];
    for (const name of toolNames) {
      const source = await this.tenantService.getTool(tenantId, name);
      if (source) tools.push({ name, source });
    }
    return tools;
  }

  private async collectAgents(tenantId: string): Promise<AgentDefinition[]> {
    const agentNames = await this.tenantService.listAgents(tenantId);
    const agents: AgentDefinition[] = [];
    for (const name of agentNames) {
      const content = await this.tenantService.getAgent(tenantId, name);
      if (content) agents.push({ name, content });
    }
    return agents;
  }
}
