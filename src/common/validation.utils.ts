import { ZodError } from "zod";

/**
 * Format Zod error into user-friendly message
 */
export function formatZodError(error: ZodError): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  return issues.join("; ");
}
