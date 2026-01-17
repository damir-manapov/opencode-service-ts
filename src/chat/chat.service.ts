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
import type { ChatRequest, ChatResponse, StreamChunk } from "./chat.types.js";

@Injectable()
export class ChatService {
  constructor(
    private readonly tenantService: TenantService,
    private readonly workspaceService: WorkspaceService,
    private readonly executorService: OpencodeExecutorService,
  ) {}

  /**
   * Process a chat request (non-streaming)
   */
  async chat(tenantId: string, request: ChatRequest): Promise<ChatResponse> {
    const tenant = await this.tenantService.getTenant(tenantId);
    if (!tenant) {
      throw new TenantNotFoundError(tenantId);
    }

    // Collect tools and agents
    const tools = await this.collectTools(tenantId, tenant, request.tools);
    const agents = await this.collectAgents(tenantId, tenant, request.agents);

    // Build workspace config
    const workspaceConfig: WorkspaceConfig = {
      tenantId,
      sessionId: request.sessionId,
      providers: tenant.providers,
      defaultModel: tenant.defaultModel,
      requestModel: request.model,
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
        model: request.model ?? tenant.defaultModel,
      });

      return {
        sessionId: request.sessionId,
        message: {
          role: "assistant",
          content: result.content,
        },
        toolCalls: result.toolCalls.length > 0 ? result.toolCalls : undefined,
      };
    } finally {
      // Cleanup workspace (if stateless)
      await workspace.cleanup();
    }
  }

  /**
   * Process a chat request with streaming response
   */
  async *chatStreaming(
    tenantId: string,
    request: ChatRequest,
  ): AsyncGenerator<StreamChunk, void, undefined> {
    const tenant = await this.tenantService.getTenant(tenantId);
    if (!tenant) {
      throw new TenantNotFoundError(tenantId);
    }

    // Collect tools and agents
    const tools = await this.collectTools(tenantId, tenant, request.tools);
    const agents = await this.collectAgents(tenantId, tenant, request.agents);

    // Build workspace config
    const workspaceConfig: WorkspaceConfig = {
      tenantId,
      sessionId: request.sessionId,
      providers: tenant.providers,
      defaultModel: tenant.defaultModel,
      requestModel: request.model,
      tools,
      agents,
      secrets: tenant.secrets ?? {},
    };

    // Generate workspace
    const workspace = await this.workspaceService.generateWorkspace(workspaceConfig);

    try {
      // Build environment
      const environment = this.workspaceService.buildEnvironment(tenant.secrets ?? {});

      // Execute OpenCode with streaming
      for await (const chunk of this.executorService.executeStreaming({
        workspace,
        messages: request.messages,
        environment,
        model: request.model ?? tenant.defaultModel,
      })) {
        yield chunk;
      }
    } finally {
      // Cleanup workspace (if stateless)
      await workspace.cleanup();
    }
  }

  /**
   * Collect all tools for the request
   */
  private async collectTools(
    tenantId: string,
    _tenant: TenantConfig,
    requestedTools?: string[],
  ): Promise<ToolDefinition[]> {
    const tools: ToolDefinition[] = [];

    // Get all tenant tools
    const tenantToolNames = await this.tenantService.listTools(tenantId);

    // Filter by requested tools if specified
    const toolNames = requestedTools
      ? tenantToolNames.filter((t) => requestedTools.includes(t))
      : tenantToolNames;

    // Load tool sources
    for (const name of toolNames) {
      const source = await this.tenantService.getTool(tenantId, name);
      if (source) {
        tools.push({ name, source });
      }
    }

    // TODO: Add predefined tools if configured
    // const predefinedTools = tenant.includePredefined?.tools ?? [];

    return tools;
  }

  /**
   * Collect all agents for the request
   */
  private async collectAgents(
    tenantId: string,
    _tenant: TenantConfig,
    requestedAgents?: string[],
  ): Promise<AgentDefinition[]> {
    const agents: AgentDefinition[] = [];

    // Get all tenant agents
    const tenantAgentNames = await this.tenantService.listAgents(tenantId);

    // Filter by requested agents if specified
    const agentNames = requestedAgents
      ? tenantAgentNames.filter((a) => requestedAgents.includes(a))
      : tenantAgentNames;

    // Load agent content
    for (const name of agentNames) {
      const content = await this.tenantService.getAgent(tenantId, name);
      if (content) {
        agents.push({ name, content });
      }
    }

    // TODO: Add predefined agents if configured
    // const predefinedAgents = tenant.includePredefined?.agents ?? [];

    return agents;
  }
}
