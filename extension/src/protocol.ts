import { z } from "zod";
import { conversationIdentityFromPageUrl } from "../../src/page-driver/profile.js";

export const DEVELOPMENT_EXTENSION_ID = "nnolaedbmhibcffbjopphajjkbcnflln" as const;
export const NATIVE_HOST_NAME = "com.agent_supervisor_runtime" as const;

export const ConversationIdentitySchema = z.object({
  conversationId: z.string().min(1),
  conversationUrl: z.string().url().refine((value) => {
    try {
      const url = new URL(value);
      return url.origin === "https://chatgpt.com" && url.pathname.startsWith("/c/");
    } catch {
      return false;
    }
  }, "must be a chatgpt.com conversation URL"),
});

export const ExtensionMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("GET_CONVERSATION_IDENTITY") }),
  z.object({ type: z.literal("PAGE_DRIVER_INSPECT") }),
  z.object({ type: z.literal("PAGE_DRIVER_SUBMIT"), message: z.string().min(1), expectedConversationId: z.string().min(1) }),
  z.object({ type: z.literal("PAGE_DRIVER_OBSERVE"), expectedConversationId: z.string().min(1), afterMessageId: z.string().min(1).optional() }),
  z.object({ type: z.literal("PAGE_DRIVER_GENERATION_STATE"), expectedConversationId: z.string().min(1) }),
  z.object({ type: z.literal("PAGE_DRIVER_HEALTH"), expectedConversationId: z.string().min(1) }),
  z.object({ type: z.literal("REGISTER_BINDING"), identity: ConversationIdentitySchema }),
  z.object({ type: z.literal("GET_EXTENSION_STATUS") }),
]);

export const ExtensionStatusSchema = z.object({
  connected: z.boolean(),
  extensionInstanceId: z.string().min(1),
  runtimeSessionId: z.string().min(1).optional(),
  binding: ConversationIdentitySchema.optional(),
  error: z.string().optional(),
});

export type ConversationIdentity = z.infer<typeof ConversationIdentitySchema>;
export type ExtensionMessage = z.infer<typeof ExtensionMessageSchema>;
export type ExtensionStatus = z.infer<typeof ExtensionStatusSchema>;

export function isContentScriptMessage(message: ExtensionMessage): boolean {
  return message.type === "GET_CONVERSATION_IDENTITY" || message.type.startsWith("PAGE_DRIVER_");
}

export function conversationIdentityFromUrl(value: string): ConversationIdentity {
  return ConversationIdentitySchema.parse(conversationIdentityFromPageUrl(value));
}
