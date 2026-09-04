import type { PageConversationIdentity, PageMessage, PageMessageRole } from "./contracts.js";

export const CHATGPT_WEB_COMPATIBILITY_PROFILE = {
  origin: "https://chatgpt.com",
  conversationPath: /^\/c\/([^/?#]+)/,
  composerSelectors: [
    '[role="textbox"][contenteditable="true"]',
    'textarea[role="textbox"]',
    '#prompt-textarea[contenteditable="true"]',
  ],
  messageSelector: '[data-message-author-role="user"], [data-message-author-role="assistant"]',
  messageContainerSelectors: ['[aria-label*="conversation" i]'],
  sendSelectors: ['button[data-testid="send-button"]', '#composer-submit-button'],
  stopSelectors: ['button[data-testid="stop-button"]'],
  sendName: /^(send(?: message| prompt)?|发送(?:消息|提示)?)$/i,
  stopName: /^(stop(?: generating)?|停止生成|停止|中止)$/i,
  continueName: /^(continue generating|继续生成)$/i,
  retryName: /^(try again|retry|重试|再试一次)$/i,
} as const;

export type RawPageMessage = {
  id?: string;
  role?: string;
  content: string;
};

export function conversationIdentityFromPageUrl(value: string): PageConversationIdentity {
  const url = new URL(value);
  if (url.origin !== CHATGPT_WEB_COMPATIBILITY_PROFILE.origin) throw new Error("CONVERSATION_IDENTITY_UNAVAILABLE");
  const conversationId = CHATGPT_WEB_COMPATIBILITY_PROFILE.conversationPath.exec(url.pathname)?.[1];
  if (!conversationId) throw new Error("CONVERSATION_IDENTITY_UNAVAILABLE");
  return { conversationId, conversationUrl: `${url.origin}/c/${conversationId}` };
}

export function normalizePageMessages(records: RawPageMessage[]): PageMessage[] {
  const messages: PageMessage[] = [];
  const seen = new Set<string>();
  for (const [index, record] of records.entries()) {
    if (!isPageMessageRole(record.role)) continue;
    const id = record.id?.trim() || `dom-${record.role}-${index + 1}`;
    if (seen.has(id)) continue;
    seen.add(id);
    messages.push({ id, role: record.role, content: record.content });
  }
  return messages;
}

export function messagesAfterCursor(messages: PageMessage[], afterMessageId?: string): PageMessage[] | undefined {
  if (afterMessageId === undefined) return messages;
  const index = messages.findIndex((message) => message.id === afterMessageId);
  return index < 0 ? undefined : messages.slice(index + 1);
}

export function accessibleControlName(element: Element): string {
  return (element.getAttribute("aria-label")
    || element.getAttribute("title")
    || element.textContent
    || "").trim();
}

function isPageMessageRole(value: string | undefined): value is PageMessageRole {
  return value === "user" || value === "assistant";
}
