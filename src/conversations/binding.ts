import { z } from "zod";

export const ConversationBindingSchema = z.object({
  bindingId: z.string().min(1),
  workspaceId: z.string().min(1),
  conversationId: z.string().min(1),
  conversationUrl: z.string().url(),
  preferredTransport: z.enum(["chrome-extension", "background-web"]),
  createdAt: z.string().datetime(),
  retiredAt: z.string().datetime().optional(),
});

export type ConversationBinding = z.infer<typeof ConversationBindingSchema>;
