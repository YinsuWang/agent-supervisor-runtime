import { z } from "zod";

const ChatGPTBindingSchema = z.object({
  bindingId: z.string().min(1),
  workspaceId: z.string().min(1),
  conversationId: z.string().min(1),
  conversationUrl: z.string().url(),
  preferredTransport: z.literal("background-web"),
  createdAt: z.string().datetime(),
  retiredAt: z.string().datetime().optional(),
}).superRefine((binding, ctx) => {
  try {
    const url = new URL(binding.conversationUrl);
    if (url.origin !== "https://chatgpt.com" || url.pathname !== `/c/${binding.conversationId}`) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["conversationUrl"], message: "must match https://chatgpt.com/c/<conversationId>" });
    }
  } catch {
    // The URL schema reports malformed URLs before this identity check.
  }
});

const MockSupervisorConfigSchema = z.object({
  adapter: z.literal("mock"),
  scriptFile: z.string().min(1).optional(),
});

const ChatGPTSupervisorConfigSchema = z.object({
  adapter: z.literal("chatgpt"),
  transport: z.literal("background-web").default("background-web"),
  binding: ChatGPTBindingSchema,
  runtimeHome: z.string().min(1).optional(),
  leaseTtlMs: z.number().int().positive().default(15_000),
  responseTimeoutMs: z.number().int().positive().default(120_000),
  pollIntervalMs: z.number().int().nonnegative().default(100),
});

export const RuntimeConfigSchema = z.object({
  version: z.literal(1),
  worker: z.object({
    adapter: z.literal("codex-exec"),
    command: z.string().min(1).default("codex"),
    argsPrefix: z.array(z.string()).optional(),
    defaultTimeoutMinutes: z.number().positive().default(120),
    verificationCommands: z.array(z.string().min(1)).optional()
  }),
  supervisor: z.discriminatedUnion("adapter", [MockSupervisorConfigSchema, ChatGPTSupervisorConfigSchema]),
  policy: z.object({
    maxRevisions: z.number().int().nonnegative().default(3),
    maxWorkerRetries: z.number().int().nonnegative().default(2),
    maxWallClockMinutes: z.number().positive().optional()
  }),
  state: z.object({
    adapter: z.literal("file"),
    directory: z.string().min(1).default(".orchestrator")
  })
});

export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;
export type ChatGPTSupervisorConfig = z.infer<typeof ChatGPTSupervisorConfigSchema>;

export const DEFAULT_CONFIG: RuntimeConfig = {
  version: 1,
  worker: { adapter: "codex-exec", command: "codex", defaultTimeoutMinutes: 120 },
  supervisor: { adapter: "mock" },
  policy: { maxRevisions: 3, maxWorkerRetries: 2, maxWallClockMinutes: 180 },
  state: { adapter: "file", directory: ".orchestrator" }
};
