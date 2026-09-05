import { z } from "zod";

export const RuntimeProtocolVersion = "ASR-NM/1" as const;

export const RuntimeFrameTypeSchema = z.enum([
  "HELLO",
  "WELCOME",
  "COMMAND",
  "EVENT",
  "ACK",
  "ERROR",
  "HEARTBEAT",
]);

export const RuntimeFrameSchema = z.object({
  protocol: z.literal(RuntimeProtocolVersion),
  frameId: z.string().min(1),
  type: RuntimeFrameTypeSchema,
  sessionId: z.string().min(1).optional(),
  timestamp: z.string().datetime(),
  payload: z.unknown().optional(),
});

export const HelloPayloadSchema = z.object({
  extensionInstanceId: z.string().min(1),
  extensionVersion: z.string().min(1),
  capabilities: z.array(z.string().min(1)).default([]),
  clientKind: z.enum(["extension", "doctor"]).default("extension"),
});

export const WelcomePayloadSchema = z.object({
  runtimeInstanceId: z.string().min(1),
  runtimeVersion: z.string().min(1),
  sessionId: z.string().min(1),
  status: z.literal("READY"),
});

export type RuntimeFrameType = z.infer<typeof RuntimeFrameTypeSchema>;
export type RuntimeFrame = z.infer<typeof RuntimeFrameSchema>;
export type HelloPayload = z.infer<typeof HelloPayloadSchema>;
export type WelcomePayload = z.infer<typeof WelcomePayloadSchema>;

export class RuntimeProtocolError extends Error {
  constructor(readonly code: "PROTOCOL_INCOMPATIBLE" | "FRAME_INVALID", message: string) {
    super(message);
    this.name = "RuntimeProtocolError";
  }
}

export function parseRuntimeFrame(input: unknown): RuntimeFrame {
  const result = RuntimeFrameSchema.safeParse(input);
  if (!result.success) {
    const protocol = typeof input === "object" && input !== null ? (input as Record<string, unknown>).protocol : undefined;
    if (protocol !== undefined && protocol !== RuntimeProtocolVersion) {
      throw new RuntimeProtocolError("PROTOCOL_INCOMPATIBLE", `Unsupported runtime protocol: ${String(protocol)}`);
    }
    throw new RuntimeProtocolError("FRAME_INVALID", result.error.message);
  }
  return result.data;
}

export function validateHello(frame: RuntimeFrame): HelloPayload {
  if (frame.type !== "HELLO") throw new RuntimeProtocolError("FRAME_INVALID", "Expected HELLO frame");
  return HelloPayloadSchema.parse(frame.payload);
}
