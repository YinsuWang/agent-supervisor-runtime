import { z } from "zod";

export const CommandResultSchema = z.object({
  command: z.string(),
  exitCode: z.number().int().nullable(),
  durationMs: z.number().nonnegative(),
  stdoutPath: z.string().optional(),
  stderrPath: z.string().optional()
});

export const VerificationResultSchema = z.object({
  command: z.string(),
  passed: z.boolean(),
  exitCode: z.number().int().nullable(),
  durationMs: z.number().nonnegative(),
  stdoutPath: z.string().optional(),
  stderrPath: z.string().optional()
});

export const ArtifactRefSchema = z.object({
  path: z.string().min(1),
  kind: z.string().min(1).optional()
});

export const MachineEvidenceSchema = z.object({
  processExitCode: z.number().int().nullable(),
  timedOut: z.boolean().default(false),
  stdoutPath: z.string().optional(),
  stderrPath: z.string().optional(),
  diffPath: z.string().optional(),
  gitStatus: z.string().optional(),
  diffStat: z.string().optional()
});

export const WorkerResultSchema = z.object({
  runId: z.string().min(1),
  taskId: z.string().min(1),
  status: z.enum(["completed", "failed", "cancelled"]),
  summary: z.string(),
  changedFiles: z.array(z.string()),
  commands: z.array(CommandResultSchema),
  verification: z.array(VerificationResultSchema),
  artifacts: z.array(ArtifactRefSchema),
  git: z.object({
    branch: z.string().optional(),
    commit: z.string().optional(),
    diffStat: z.string().optional()
  }).optional(),
  machineEvidence: MachineEvidenceSchema,
  warnings: z.array(z.string()).optional(),
  unresolvedIssues: z.array(z.string()).optional(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime()
});

export type CommandResult = z.infer<typeof CommandResultSchema>;
export type VerificationResult = z.infer<typeof VerificationResultSchema>;
export type ArtifactRef = z.infer<typeof ArtifactRefSchema>;
export type MachineEvidence = z.infer<typeof MachineEvidenceSchema>;
export type WorkerResult = z.infer<typeof WorkerResultSchema>;
