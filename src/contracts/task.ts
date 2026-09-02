import { z } from "zod";

export const TaskSchema = z.object({
  taskId: z.string().min(1),
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
    timeoutSeconds: z.number().int().positive().optional(),
    allowNetwork: z.boolean().optional()
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
