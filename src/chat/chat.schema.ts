import { z } from "zod";

// Tool call schema
export const ToolCallSchema = z.object({
  id: z.string(),
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    arguments: z.string(),
  }),
});

// Chat message schema
export const ChatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string().nullable(),
  name: z.string().optional(),
  tool_calls: z.array(ToolCallSchema).optional(),
  tool_call_id: z.string().optional(),
});

// Tool definition schema
export const ToolDefinitionSchema = z.object({
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    description: z.string().optional(),
    parameters: z.record(z.string(), z.unknown()).optional(),
  }),
});

// Tool choice schema
export const ToolChoiceSchema = z.union([
  z.literal("none"),
  z.literal("auto"),
  z.literal("required"),
  z.object({
    type: z.literal("function"),
    function: z.object({ name: z.string() }),
  }),
]);

// Main request schema
export const ChatCompletionRequestSchema = z.object({
  model: z.string().min(1, "model is required"),
  messages: z.array(ChatMessageSchema).min(1, "messages array must not be empty"),
  stream: z.boolean().optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
  top_p: z.number().min(0).max(1).optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  tools: z.array(ToolDefinitionSchema).optional(),
  tool_choice: ToolChoiceSchema.optional(),
});

// Inferred type from schema
export type ChatCompletionRequestValidated = z.infer<typeof ChatCompletionRequestSchema>;

// Validation helper
export function validateChatCompletionRequest(data: unknown): ChatCompletionRequestValidated {
  return ChatCompletionRequestSchema.parse(data);
}

// Safe validation (returns result instead of throwing)
export function safeParseChatCompletionRequest(data: unknown) {
  return ChatCompletionRequestSchema.safeParse(data);
}
