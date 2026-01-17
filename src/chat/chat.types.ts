export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ModelSelection {
  providerId: string;
  modelId: string;
}

export interface ChatRequest {
  sessionId?: string;
  model?: ModelSelection;
  tools?: string[];
  agents?: string[];
  messages: ChatMessage[];
  stream?: boolean;
}

export interface ChatResponse {
  sessionId?: string;
  message: {
    role: "assistant";
    content: string;
  };
  toolCalls?: ToolCallResult[];
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
