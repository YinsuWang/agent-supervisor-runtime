import { z } from "zod";

export const RuntimeConfigSchema = z.object({
  version: z.literal(1),
  worker: z.object({
    adapter: z.literal("codex-exec"),
    command: z.string().min(1).default("codex"),
    argsPrefix: z.array(z.string()).optional(),
    defaultTimeoutMinutes: z.number().positive().default(120),
    verificationCommands: z.array(z.string().min(1)).optional()
  }),
  supervisor: z.object({
    adapter: z.literal("mock"),
    scriptFile: z.string().min(1).optional()
  }),
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

export const DEFAULT_CONFIG: RuntimeConfig = {
  version: 1,
  worker: { adapter: "codex-exec", command: "codex", defaultTimeoutMinutes: 120 },
  supervisor: { adapter: "mock" },
  policy: { maxRevisions: 3, maxWorkerRetries: 2, maxWallClockMinutes: 180 },
  state: { adapter: "file", directory: ".orchestrator" }
};
