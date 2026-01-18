import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { TenantNotFoundError } from "../errors/index.js";
import { OpencodeExecutorService } from "../executor/opencode-executor.service.js";
import { TenantService } from "../tenant/tenant.service.js";
import type { TenantConfig } from "../tenant/tenant.types.js";
import { WorkspaceService } from "../workspace/workspace.service.js";
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

@Injectable()
export class ChatService {
  constructor(
    private readonly tenantService: TenantService,
    private readonly workspaceService: WorkspaceService,
    private readonly executorService: OpencodeExecutorService,
  ) {}

  /**
   * Process a chat completion request (non-streaming)
   * OpenAI-compatible endpoint
   */
  async chatCompletions(
    tenantId: string,
    request: ChatCompletionRequest,
  ): Promise<ChatCompletionResponse> {
    const tenant = await this.tenantService.getTenant(tenantId);
    if (!tenant) {
      throw new TenantNotFoundError(tenantId);
    }

    // Parse model string to internal format
    const modelSelection = this.parseModel(request.model, tenant);

    // Collect tools and agents (currently empty, will be expanded later)
    const tools = await this.collectTools(tenantId, tenant);
    const agents = await this.collectAgents(tenantId, tenant);

    // Build workspace config
    const workspaceConfig: WorkspaceConfig = {
      tenantId,
      sessionId: undefined,
      providers: tenant.providers,
      defaultModel: tenant.defaultModel,
      requestModel: modelSelection,
      tools,
      agents,
      secrets: tenant.secrets ?? {},
    };

    // Generate workspace
    const workspace = await this.workspaceService.generateWorkspace(workspaceConfig);

    try {
      // Build environment
      const environment = this.workspaceService.buildEnvironment(tenant.secrets ?? {});

      // Execute OpenCode
      const result = await this.executorService.execute({
        workspace,
        messages: request.messages,
        environment,
        model: modelSelection,
      });

      // Build OpenAI-compatible response
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
                ? result.toolCalls.map((tc, _idx) => ({
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
          prompt_tokens: 0, // TODO: Calculate actual tokens
          completion_tokens: 0,
          total_tokens: 0,
        },
      };
    } finally {
      // Cleanup workspace (if stateless)
      await workspace.cleanup();
    }
  }

  /**
   * Process a chat completion request with streaming response
   * OpenAI-compatible endpoint
   */
  async *chatCompletionsStreaming(
    tenantId: string,
    request: ChatCompletionRequest,
  ): AsyncGenerator<ChatCompletionChunk, void, undefined> {
    const tenant = await this.tenantService.getTenant(tenantId);
    if (!tenant) {
      throw new TenantNotFoundError(tenantId);
    }

    // Parse model string to internal format
    const modelSelection = this.parseModel(request.model, tenant);

    // Collect tools and agents (currently empty, will be expanded later)
    const tools = await this.collectTools(tenantId, tenant);
    const agents = await this.collectAgents(tenantId, tenant);

    // Build workspace config
    const workspaceConfig: WorkspaceConfig = {
      tenantId,
      sessionId: undefined,
      providers: tenant.providers,
      defaultModel: tenant.defaultModel,
      requestModel: modelSelection,
      tools,
      agents,
      secrets: tenant.secrets ?? {},
    };

    // Generate workspace
    const workspace = await this.workspaceService.generateWorkspace(workspaceConfig);
    const completionId = `chatcmpl-${randomUUID()}`;
    const created = Math.floor(Date.now() / 1000);

    try {
      // Build environment
      const environment = this.workspaceService.buildEnvironment(tenant.secrets ?? {});

      // Send initial role chunk
      yield {
        id: completionId,
        object: "chat.completion.chunk",
        created,
        model: request.model,
        choices: [
          {
            index: 0,
            delta: { role: "assistant" },
            finish_reason: null,
          },
        ],
      };

      // Execute OpenCode with streaming
      for await (const chunk of this.executorService.executeStreaming({
        workspace,
        messages: request.messages,
        environment,
        model: modelSelection,
      })) {
        if (chunk.type === "text" && chunk.content) {
          yield {
            id: completionId,
            object: "chat.completion.chunk",
            created,
            model: request.model,
            choices: [
              {
                index: 0,
                delta: { content: chunk.content },
                finish_reason: null,
              },
            ],
          };
        } else if (chunk.type === "done") {
          yield {
            id: completionId,
            object: "chat.completion.chunk",
            created,
            model: request.model,
            choices: [
              {
                index: 0,
                delta: {},
                finish_reason: "stop",
              },
            ],
          };
        }
      }
    } finally {
      // Cleanup workspace (if stateless)
      await workspace.cleanup();
    }
  }

  /**
   * Parse model string to internal ModelSelection format
   * Supports formats: "provider/model" or just "model" (uses default provider)
   */
  private parseModel(model: string, tenant: TenantConfig): ModelSelection {
    if (model.includes("/")) {
      const [providerId, modelId] = model.split("/", 2);
      return { providerId: providerId ?? "", modelId: modelId ?? "" };
    }

    // Use tenant's default provider
    if (tenant.defaultModel) {
      return {
        providerId: tenant.defaultModel.providerId,
        modelId: model,
      };
    }

    // Fallback: use first configured provider
    const firstProvider = Object.keys(tenant.providers)[0];
    return {
      providerId: firstProvider ?? "",
      modelId: model,
    };
  }

  /**
   * Collect all tools for the request
   */
  private async collectTools(tenantId: string, _tenant: TenantConfig): Promise<ToolDefinition[]> {
    const tools: ToolDefinition[] = [];

    // Get all tenant tools
    const toolNames = await this.tenantService.listTools(tenantId);

    // Load tool sources
    for (const name of toolNames) {
      const source = await this.tenantService.getTool(tenantId, name);
      if (source) {
        tools.push({ name, source });
      }
    }

    return tools;
  }

  /**
   * Collect all agents for the request
   */
  private async collectAgents(tenantId: string, _tenant: TenantConfig): Promise<AgentDefinition[]> {
    const agents: AgentDefinition[] = [];

    // Get all tenant agents
    const agentNames = await this.tenantService.listAgents(tenantId);

    // Load agent content
    for (const name of agentNames) {
      const content = await this.tenantService.getAgent(tenantId, name);
      if (content) {
        agents.push({ name, content });
      }
    }

    return agents;
  }
}
