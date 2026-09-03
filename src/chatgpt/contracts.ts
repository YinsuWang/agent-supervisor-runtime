import { z } from "zod";

export const AsrMessageKindSchema = z.enum([
  "PLAN_REQUEST",
  "PLAN",
  "REVIEW_REQUEST",
  "REVIEW",
  "CONTEXT_REQUEST",
  "CONTEXT_RESPONSE",
  "NOTIFICATION",
]);

export const AsrEnvelopeSchema = z.object({
  protocolVersion: z.literal("ASR/1"),
  messageId: z.string().min(1),
  bindingId: z.string().min(1),
  taskId: z.string().min(1),
  runId: z.string().min(1),
  kind: AsrMessageKindSchema,
  sequence: z.number().int().nonnegative(),
  correlationId: z.string().min(1).optional(),
});

export const SupervisorReplyEnvelopeSchema = z.object({
  protocolVersion: z.literal("ASR/1"),
  messageId: z.string().min(1),
  inReplyTo: z.string().min(1),
  bindingId: z.string().min(1),
  taskId: z.string().min(1),
  runId: z.string().min(1),
  kind: z.literal("REVIEW"),
  decision: z.enum(["PASS", "REVISE", "ASK_USER"]),
  findings: z.array(z.string()).default([]),
  instruction: z.string().optional(),
});

export type AsrMessageKind = z.infer<typeof AsrMessageKindSchema>;
export type AsrEnvelope = z.infer<typeof AsrEnvelopeSchema>;
export type SupervisorReplyEnvelope = z.infer<typeof SupervisorReplyEnvelopeSchema>;
