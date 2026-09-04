import { ExtensionChatGptPageDriver } from "../../src/page-driver/extension-backend.js";
import { ExtensionMessageSchema, isContentScriptMessage } from "./protocol.js";

chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
  const parsed = ExtensionMessageSchema.safeParse(raw);
  if (!parsed.success || !isContentScriptMessage(parsed.data)) return false;

  void (async () => {
    try {
      const message = parsed.data;
      const driver = new ExtensionChatGptPageDriver(
        "expectedConversationId" in message
          ? { expectedConversationId: message.expectedConversationId }
          : {},
      );
      switch (message.type) {
        case "GET_CONVERSATION_IDENTITY":
        case "PAGE_DRIVER_INSPECT":
          sendResponse({ ok: true, identity: await driver.inspectConversation() });
          return;
        case "PAGE_DRIVER_SUBMIT":
          sendResponse({ ok: true, receipt: await driver.submitMessage(message.message) });
          return;
        case "PAGE_DRIVER_OBSERVE": {
          const messages = [];
          for await (const observed of driver.observeMessages({ afterMessageId: message.afterMessageId })) messages.push(observed);
          sendResponse({ ok: true, messages });
          return;
        }
        case "PAGE_DRIVER_GENERATION_STATE":
          sendResponse({ ok: true, state: await driver.detectGenerationState() });
          return;
        case "PAGE_DRIVER_HEALTH":
          sendResponse({ ok: true, health: await driver.health() });
          return;
      }
    } catch (error) {
      const typed = error as Error & { code?: string };
      sendResponse({ ok: false, error: typed.message, code: typed.code });
    }
  })();
  return true;
});
