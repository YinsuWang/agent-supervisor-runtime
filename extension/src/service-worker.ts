import {
  ConversationIdentitySchema,
  ExtensionMessageSchema,
  ExtensionStatusSchema,
  NATIVE_HOST_NAME,
  type ConversationIdentity,
  type ExtensionStatus,
} from "./protocol.js";

type NativeFrame = {
  protocol: "ASR-NM/1";
  frameId: string;
  type: "HELLO" | "WELCOME" | "COMMAND" | "EVENT" | "ACK" | "ERROR" | "HEARTBEAT";
  sessionId?: string;
  timestamp: string;
  payload?: unknown;
};

let port: chrome.runtime.Port | undefined;
let runtimeSessionId: string | undefined;
let reconnectDelayMs = 250;
const pending = new Map<string, { resolve: (frame: NativeFrame) => void; reject: (error: Error) => void; timer: number }>();

chrome.runtime.onStartup.addListener(() => { void ensureNativeConnection(); });
chrome.runtime.onInstalled.addListener(() => { void ensureNativeConnection(); });
void ensureNativeConnection();

chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
  const parsed = ExtensionMessageSchema.safeParse(raw);
  if (!parsed.success) {
    sendResponse({ ok: false, error: "INVALID_EXTENSION_MESSAGE" });
    return false;
  }

  if (parsed.data.type === "GET_CONVERSATION_IDENTITY") return false;

  void (async () => {
    try {
      if (parsed.data.type === "GET_EXTENSION_STATUS") {
        sendResponse({ ok: true, status: await currentStatus() });
        return;
      }
      if (parsed.data.type !== "REGISTER_BINDING") {
        sendResponse({ ok: false, error: "UNSUPPORTED_EXTENSION_MESSAGE" });
        return;
      }
      const identity = ConversationIdentitySchema.parse(parsed.data.identity);
      await sendRuntimeCommand("BIND_CONVERSATION", identity);
      await chrome.storage.local.set({ binding: identity });
      sendResponse({ ok: true, binding: identity });
    } catch (error) {
      sendResponse({ ok: false, error: (error as Error).message });
    }
  })();
  return true;
});

async function ensureNativeConnection(): Promise<chrome.runtime.Port> {
  if (port) return port;
  const instanceId = await extensionInstanceId();
  const candidate = chrome.runtime.connectNative(NATIVE_HOST_NAME);
  port = candidate;
  candidate.onMessage.addListener((message) => onNativeMessage(message as NativeFrame));
  candidate.onDisconnect.addListener(() => {
    if (port !== candidate) return;
    port = undefined;
    runtimeSessionId = undefined;
    rejectPending(new Error(chrome.runtime.lastError?.message ?? "NATIVE_HOST_DISCONNECTED"));
    const delay = reconnectDelayMs;
    reconnectDelayMs = Math.min(reconnectDelayMs * 2, 10_000);
    setTimeout(() => void ensureNativeConnection().catch(() => {}), delay);
  });
  candidate.postMessage({
    protocol: "ASR-NM/1",
    frameId: crypto.randomUUID(),
    type: "HELLO",
    timestamp: new Date().toISOString(),
    payload: {
      extensionInstanceId: instanceId,
      extensionVersion: chrome.runtime.getManifest().version,
      capabilities: ["conversation-observe", "conversation-send", "binding-ui"],
    },
  } satisfies NativeFrame);
  return candidate;
}

function onNativeMessage(frame: NativeFrame): void {
  if (frame.protocol !== "ASR-NM/1") return;
  if (frame.type === "WELCOME") {
    const payload = frame.payload as { sessionId?: unknown } | undefined;
    if (typeof payload?.sessionId === "string") runtimeSessionId = payload.sessionId;
    reconnectDelayMs = 250;
    return;
  }
  if (frame.type !== "ACK" && frame.type !== "ERROR") return;
  const payload = frame.payload as { inReplyTo?: unknown; code?: unknown; message?: unknown } | undefined;
  if (typeof payload?.inReplyTo !== "string") return;
  const waiter = pending.get(payload.inReplyTo);
  if (!waiter) return;
  pending.delete(payload.inReplyTo);
  clearTimeout(waiter.timer);
  if (frame.type === "ERROR") waiter.reject(new Error(`${String(payload.code ?? "RUNTIME_ERROR")}:${String(payload.message ?? "")}`));
  else waiter.resolve(frame);
}

async function sendRuntimeCommand(name: string, data: ConversationIdentity): Promise<NativeFrame> {
  const nativePort = await ensureNativeConnection();
  const frameId = crypto.randomUUID();
  const response = new Promise<NativeFrame>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(frameId);
      reject(new Error("RUNTIME_COMMAND_TIMEOUT"));
    }, 10_000) as unknown as number;
    pending.set(frameId, { resolve, reject, timer });
  });
  nativePort.postMessage({
    protocol: "ASR-NM/1",
    frameId,
    type: "COMMAND",
    sessionId: runtimeSessionId,
    timestamp: new Date().toISOString(),
    payload: { name, ...data },
  } satisfies NativeFrame);
  return response;
}

async function extensionInstanceId(): Promise<string> {
  const stored = await chrome.storage.local.get("extensionInstanceId");
  if (typeof stored.extensionInstanceId === "string" && stored.extensionInstanceId.length > 0) return stored.extensionInstanceId;
  const value = `extinst_${crypto.randomUUID()}`;
  await chrome.storage.local.set({ extensionInstanceId: value });
  return value;
}

async function currentStatus(): Promise<ExtensionStatus> {
  const stored = await chrome.storage.local.get(["extensionInstanceId", "binding"]);
  return ExtensionStatusSchema.parse({
    connected: Boolean(port && runtimeSessionId),
    extensionInstanceId: typeof stored.extensionInstanceId === "string" ? stored.extensionInstanceId : await extensionInstanceId(),
    runtimeSessionId,
    binding: stored.binding,
  });
}

function rejectPending(error: Error): void {
  for (const [id, waiter] of pending) {
    clearTimeout(waiter.timer);
    waiter.reject(error);
    pending.delete(id);
  }
}
