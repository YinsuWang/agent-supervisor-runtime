import { z } from "zod";
import { SupervisorResponseInvalidError } from "../core/errors.js";

export const SupervisorControlBlockSchema = z.object({
  version: z.literal(1),
  action: z.enum(["DISPATCH", "REVIEW", "ASK_USER", "NO_ACTION"]),
  decision: z.enum(["PASS", "REVISE", "ASK_USER"]).optional(),
  revisionInstructions: z.array(z.string().min(1)).optional(),
  userQuestion: z.string().min(1).optional()
});

export type SupervisorControlBlock = z.infer<typeof SupervisorControlBlockSchema>;

export function parseSupervisorControlBlock(message: string): SupervisorControlBlock {
  const match = message.match(/<orchestrator>\s*([\s\S]*?)\s*<\/orchestrator>/i);
  if (!match?.[1]) throw new SupervisorResponseInvalidError("Missing <orchestrator> control block");

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    throw new SupervisorResponseInvalidError("Supervisor control block is not valid JSON");
  }

  const result = SupervisorControlBlockSchema.safeParse(parsed);
  if (!result.success) throw new SupervisorResponseInvalidError(result.error.message);
  return result.data;
}
