// OpenAI-compatible Chat Completions API types

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinitionParam {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

// Internal model selection (mapped from string model name)
export interface ModelSelection {
  providerId: string;
  modelId: string;
}

// OpenAI-compatible request
export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stop?: string | string[];
  tools?: ToolDefinitionParam[];
  tool_choice?: "none" | "auto" | "required" | { type: "function"; function: { name: string } };
  // Custom extensions (prefixed with x-)
  "x-session-id"?: string;
  "x-agents"?: string[];
  "x-tools"?: string[];
}

// OpenAI-compatible response
export interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ChatCompletionChoice {
  index: number;
  message: {
    role: "assistant";
    content: string | null;
    tool_calls?: ToolCall[];
  };
  finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | null;
}

// OpenAI-compatible streaming chunk
export interface ChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: ChatCompletionChunkChoice[];
}

export interface ChatCompletionChunkChoice {
  index: number;
  delta: {
    role?: "assistant";
    content?: string;
    tool_calls?: Partial<ToolCall>[];
  };
  finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | null;
}

// Internal types for executor communication
export interface ExecutorResult {
  content: string;
  toolCalls: ToolCallResult[];
}

export interface ToolCallResult {
  name: string;
  input: unknown;
  output: unknown;
}

export interface StreamChunk {
  type: "text" | "tool_call" | "done";
  content?: string;
  toolCall?: ToolCallResult;
}

// Legacy types for backwards compatibility (deprecated)
/** @deprecated Use ChatCompletionRequest instead */
export type ChatRequest = ChatCompletionRequest;
/** @deprecated Use ChatCompletionResponse instead */
export type ChatResponse = ChatCompletionResponse;
