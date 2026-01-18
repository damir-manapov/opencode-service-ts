import { z } from "zod";
import { ModelConfigSchema, ProviderConfigSchema } from "../admin/admin.schema.js";

// Update tenant config schema (all fields optional for partial updates)
export const UpdateConfigInputSchema = z.object({
  name: z
    .string()
    .min(1, "name cannot be empty")
    .max(100, "name must be at most 100 characters")
    .regex(
      /^[a-zA-Z0-9_ -]+$/,
      "name must contain only alphanumeric characters, spaces, hyphens, and underscores",
    )
    .optional(),
  providers: z.record(z.string(), ProviderConfigSchema).optional(),
  defaultModel: ModelConfigSchema.optional(),
});

// Tool/Agent name schema (reusable)
export const ResourceNameSchema = z
  .string()
  .min(1, "name is required")
  .regex(/^[a-z0-9-]+$/, "name must contain only lowercase alphanumeric characters and hyphens");

// Secret name schema
export const SecretNameSchema = z
  .string()
  .min(1, "name is required")
  .regex(
    /^[A-Z0-9_]+$/,
    "name must contain only uppercase alphanumeric characters and underscores",
  );

// Secret value schema
export const SecretValueSchema = z.object({
  value: z.string().min(1, "value is required"),
});

// Inferred types
export type UpdateConfigInputValidated = z.infer<typeof UpdateConfigInputSchema>;
export type SecretValueValidated = z.infer<typeof SecretValueSchema>;

// Safe validation helpers
export function safeParseUpdateConfigInput(data: unknown) {
  return UpdateConfigInputSchema.safeParse(data);
}

export function safeParseSecretValue(data: unknown) {
  return SecretValueSchema.safeParse(data);
}
