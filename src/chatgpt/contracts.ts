import { z } from "zod";
import { ContextQuerySchema, ContextResponseSchema } from "../context/contracts.js";

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

export const ContextRequestEnvelopeSchema = z.object({
  protocolVersion: z.literal("ASR/1"),
  messageId: z.string().min(1),
  inReplyTo: z.string().min(1),
  bindingId: z.string().min(1),
  taskId: z.string().min(1),
  runId: z.string().min(1),
  kind: z.literal("CONTEXT_REQUEST"),
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

export const ContextResponseEnvelopeSchema = AsrEnvelopeSchema.extend({
  kind: z.literal("CONTEXT_RESPONSE"),
  correlationId: z.string().min(1),
  payload: z.union([
    ContextResponseSchema,
    z.object({
      error: z.object({
        code: z.string().min(1),
        message: z.string().min(1),
      }),
    }),
  ]),
});

export type AsrMessageKind = z.infer<typeof AsrMessageKindSchema>;
export type AsrEnvelope = z.infer<typeof AsrEnvelopeSchema>;
export type SupervisorReplyEnvelope = z.infer<typeof SupervisorReplyEnvelopeSchema>;
export type ContextRequestEnvelope = z.infer<typeof ContextRequestEnvelopeSchema>;
export type ContextResponseEnvelope = z.infer<typeof ContextResponseEnvelopeSchema>;
