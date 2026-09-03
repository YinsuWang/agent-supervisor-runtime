import { z } from "zod";

export const ContextCapabilitySchema = z.enum([
  "execution_summary",
  "test_summary",
  "git_status",
  "git_diff",
  "changed_files",
  "read_file",
  "search_workspace",
  "list_directory",
]);

export type ContextCapability = z.infer<typeof ContextCapabilitySchema>;

export const ContextScopeSchema = z.object({
  bindingId: z.string().min(1),
  taskId: z.string().min(1),
  runId: z.string().min(1),
  workspaceRoot: z.string().min(1),
});

export type ContextScope = z.infer<typeof ContextScopeSchema>;

export const ContextManifestItemSchema = z.object({
  ref: z.string().min(1),
  capability: ContextCapabilitySchema,
  summary: z.string(),
  size: z.number().int().nonnegative(),
});

export const ContextManifestSchema = z.object({
  bindingId: z.string().min(1),
  taskId: z.string().min(1),
  runId: z.string().min(1),
  available: z.array(ContextManifestItemSchema),
});

export type ContextManifestItem = z.infer<typeof ContextManifestItemSchema>;
export type ContextManifest = z.infer<typeof ContextManifestSchema>;

export const ContextQuerySchema = z.object({
  capability: ContextCapabilitySchema,
  path: z.string().optional(),
  query: z.string().optional(),
});

export type ContextQuery = z.infer<typeof ContextQuerySchema>;

export const ContextRequestSchema = z.object({
  bindingId: z.string().min(1),
  taskId: z.string().min(1),
  runId: z.string().min(1),
  ref: z.string().min(1).optional(),
  query: ContextQuerySchema.optional(),
  continuation: z.string().min(1).optional(),
}).superRefine((value, ctx) => {
  const selectors = [value.ref, value.query, value.continuation].filter((item) => item !== undefined);
  if (selectors.length !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Context request requires exactly one of ref, query, or continuation",
    });
  }
});

export type ContextRequest = z.infer<typeof ContextRequestSchema>;

export const ContextResponseSchema = z.object({
  capability: ContextCapabilitySchema,
  content: z.string(),
  truncated: z.boolean(),
  continuation: z.string().min(1).optional(),
});

export type ContextResponse = z.infer<typeof ContextResponseSchema>;

export type ContextErrorCode =
  | "CONTEXT_POLICY_VIOLATION"
  | "CONTEXT_REF_NOT_FOUND"
  | "CONTEXT_SCOPE_MISMATCH"
  | "CONTEXT_BUDGET_EXCEEDED"
  | "CONTEXT_CONTINUATION_INVALID"
  | "CONTEXT_CAPABILITY_UNSUPPORTED";

export class ContextBrokerError extends Error {
  constructor(readonly code: ContextErrorCode, message: string) {
    super(message);
    this.name = "ContextBrokerError";
  }
}
