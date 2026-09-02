import { z } from "zod";

export const RunStateSchema = z.enum([
  "CREATED", "READY", "DISPATCHED", "RUNNING", "RETRY_READY",
  "RESULT_READY", "REVIEWING", "REVISION_READY", "COMPLETED", "BLOCKED", "FAILED"
]);
export type RunState = z.infer<typeof RunStateSchema>;

export const TaskRecordSchema = z.object({
  taskId: z.string().min(1),
  projectId: z.string().min(1),
  state: RunStateSchema,
  currentRunId: z.string().optional(),
  previousRunId: z.string().optional(),
  revisionCount: z.number().int().nonnegative(),
  retryCount: z.number().int().nonnegative(),
  runCount: z.number().int().nonnegative().optional(),
  startedAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime(),
  blockedReason: z.string().optional(),
  failedReason: z.string().optional()
});
export type TaskRecord = z.infer<typeof TaskRecordSchema>;

export type OrchestratorEvent = {
  event: string;
  timestamp: string;
  taskId: string;
  runId?: string;
  data?: Record<string, unknown>;
};
