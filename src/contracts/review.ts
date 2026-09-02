import { z } from "zod";

export const ReviewFindingSchema = z.object({
  severity: z.enum(["info", "minor", "major", "critical"]),
  category: z.string().min(1),
  message: z.string().min(1),
  fingerprint: z.string().min(1).optional(),
  requiresUserDecision: z.boolean().optional()
});

export const ReviewSchema = z.object({
  taskId: z.string().min(1),
  runId: z.string().min(1),
  decision: z.enum(["PASS", "REVISE", "ASK_USER"]),
  summary: z.string().min(1),
  findings: z.array(ReviewFindingSchema),
  revisionInstructions: z.array(z.string().min(1)).optional(),
  userQuestion: z.string().min(1).optional(),
  confidence: z.enum(["high", "medium", "low"]).optional()
}).superRefine((value, ctx) => {
  if (value.decision === "REVISE" && (!value.revisionInstructions || value.revisionInstructions.length === 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "REVISE requires revisionInstructions", path: ["revisionInstructions"] });
  }
  if (value.decision === "ASK_USER" && !value.userQuestion) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "ASK_USER requires userQuestion", path: ["userQuestion"] });
  }
});

export type ReviewFinding = z.infer<typeof ReviewFindingSchema>;
export type Review = z.infer<typeof ReviewSchema>;
