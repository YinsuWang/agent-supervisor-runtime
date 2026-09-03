import { ConversationIdentitySchema, type ExtensionStatus } from "./protocol.js";

const bindButton = document.querySelector<HTMLButtonElement>("#bind");
const statusNode = document.querySelector<HTMLElement>("#status");
if (!bindButton || !statusNode) throw new Error("POPUP_DOM_INVALID");

bindButton.addEventListener("click", () => void bindCurrentConversation());
void refreshStatus();

async function bindCurrentConversation(): Promise<void> {
  bindButton!.disabled = true;
  setStatus("Binding current conversation…");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("ACTIVE_TAB_UNAVAILABLE");
    const pageResponse = await chrome.tabs.sendMessage(tab.id, { type: "GET_CONVERSATION_IDENTITY" });
    if (!pageResponse?.ok) throw new Error(pageResponse?.error ?? "CONVERSATION_IDENTITY_UNAVAILABLE");
    const identity = ConversationIdentitySchema.parse(pageResponse.identity);
    const runtimeResponse = await chrome.runtime.sendMessage({ type: "REGISTER_BINDING", identity });
    if (!runtimeResponse?.ok) throw new Error(runtimeResponse?.error ?? "BINDING_REGISTRATION_FAILED");
    setStatus(`Bound: ${identity.conversationId}`);
  } catch (error) {
    setStatus(`Not bound: ${(error as Error).message}`);
  } finally {
    bindButton!.disabled = false;
  }
}

async function refreshStatus(): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_EXTENSION_STATUS" });
    if (!response?.ok) throw new Error(response?.error ?? "STATUS_UNAVAILABLE");
    const status = response.status as ExtensionStatus;
    const transport = status.connected ? "runtime connected" : "runtime offline";
    const binding = status.binding ? ` · bound ${status.binding.conversationId}` : " · not bound";
    setStatus(`${transport}${binding}`);
  } catch (error) {
    setStatus(`Runtime unavailable: ${(error as Error).message}`);
  }
}

function setStatus(value: string): void {
  statusNode!.textContent = value;
}
