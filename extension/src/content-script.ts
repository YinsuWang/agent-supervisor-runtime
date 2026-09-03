import { ExtensionMessageSchema, conversationIdentityFromUrl } from "./protocol.js";

chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
  const parsed = ExtensionMessageSchema.safeParse(raw);
  if (!parsed.success || parsed.data.type !== "GET_CONVERSATION_IDENTITY") return false;
  try {
    sendResponse({ ok: true, identity: conversationIdentityFromUrl(window.location.href) });
  } catch (error) {
    sendResponse({ ok: false, error: (error as Error).message });
  }
  return false;
});
