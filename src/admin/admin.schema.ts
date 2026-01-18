import { z } from "zod";

// Provider config schema
export const ProviderConfigSchema = z.object({
  apiKey: z.string().min(1, "apiKey is required"),
});

// Model config schema
export const ModelConfigSchema = z.object({
  providerId: z.string().min(1, "providerId is required"),
  modelId: z.string().min(1, "modelId is required"),
});

// Create tenant input schema
export const CreateTenantInputSchema = z.object({
  name: z
    .string()
    .min(1, "name is required")
    .max(100, "name must be at most 100 characters")
    .regex(/^[a-zA-Z0-9_ -]+$/, "name must contain only alphanumeric characters, spaces, hyphens, and underscores"),
  providers: z.record(z.string(), ProviderConfigSchema).optional().default({}),
  defaultModel: ModelConfigSchema.optional(),
});

// Inferred type from schema
export type CreateTenantInputValidated = z.infer<typeof CreateTenantInputSchema>;

// Validation helper with formatted error
export function validateCreateTenantInput(data: unknown): CreateTenantInputValidated {
  return CreateTenantInputSchema.parse(data);
}

// Safe validation (returns result instead of throwing)
export function safeParseCreateTenantInput(data: unknown) {
  return CreateTenantInputSchema.safeParse(data);
}
