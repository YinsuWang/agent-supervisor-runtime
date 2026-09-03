import { z } from "zod";

const stateIdentifier = z.string().min(1).refine(
  (value) => value !== "." && value !== ".." && !/[\\/:\0]/.test(value),
  { message: "must be a safe state identifier without path separators, colon, or NUL" }
);

export const TaskSchema = z.object({
  taskId: stateIdentifier,
  projectId: z.string().min(1),
  objective: z.string().min(1),
  context: z.string().optional(),
  instructions: z.array(z.string().min(1)).min(1),
  constraints: z.array(z.string().min(1)).optional(),
  acceptanceCriteria: z.array(z.string().min(1)).min(1),
  artifacts: z.object({
    expected: z.array(z.string().min(1)).optional(),
    forbidden: z.array(z.string().min(1)).optional()
  }).optional(),
  execution: z.object({
    workingDirectory: z.string().min(1),
    timeoutSeconds: z.number().int().positive().optional()
  }),
  budget: z.object({
    maxRuns: z.number().int().positive().optional(),
    maxWallClockMinutes: z.number().positive().optional()
  }).optional(),
  revision: z.object({
    parentRunId: z.string().min(1),
    revisionNumber: z.number().int().nonnegative()
  }).optional()
});

export type Task = z.infer<typeof TaskSchema>;
