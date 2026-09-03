export type PageCompatibilityStatus = "COMPATIBLE" | "INCOMPATIBLE";

export type PageCapabilityReport = {
  conversationIdentity: boolean;
  composer: boolean;
  submit: boolean;
  assistantMessages: boolean;
  generationLifecycle: boolean;
};

export type PageCompatibility = PageCapabilityReport & {
  status: PageCompatibilityStatus;
  missing: Array<keyof PageCapabilityReport>;
};

export type PageConversationIdentity = {
  conversationId: string;
  conversationUrl: string;
};

export type PageMessageRole = "user" | "assistant";

export type PageMessage = {
  id: string;
  role: PageMessageRole;
  content: string;
};

export type MessageCursor = {
  afterMessageId?: string;
};

export type SubmitReceipt = {
  messageId: string;
};

export type GenerationState = "IDLE" | "GENERATING";

export interface ChatGptPageDriver {
  inspectConversation(): Promise<PageConversationIdentity>;
  submitMessage(message: string): Promise<SubmitReceipt>;
  observeMessages(cursor?: MessageCursor): AsyncIterable<PageMessage>;
  detectGenerationState(): Promise<GenerationState>;
  health(): Promise<PageCompatibility>;
}
