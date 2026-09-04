import { describe, expect, it } from "vitest";
import { createNativeHostManifest } from "../../src/setup/native-host-manifest.js";
import {
  DEVELOPMENT_EXTENSION_ID,
  ExtensionMessageSchema,
  conversationIdentityFromUrl,
  isContentScriptMessage,
} from "../../extension/src/protocol.js";

describe("Chrome extension protocol", () => {
  it("extracts a stable conversation identity from ordinary ChatGPT conversation URLs", () => {
    expect(conversationIdentityFromUrl("https://chatgpt.com/c/67fabc?model=auto#latest")).toEqual({
      conversationId: "67fabc",
      conversationUrl: "https://chatgpt.com/c/67fabc",
    });
  });

  it.each([
    "https://chatgpt.com/",
    "https://chatgpt.com/g/g-123-project",
    "https://example.com/c/67fabc",
  ])("rejects an unbindable page: %s", (url) => {
    expect(() => conversationIdentityFromUrl(url)).toThrow();
  });

  it("keeps the development extension identity compatible with native messaging registration", () => {
    const manifest = createNativeHostManifest({
      path: "C:\\ASR\\host.exe",
      extensionId: DEVELOPMENT_EXTENSION_ID,
    });
    expect(DEVELOPMENT_EXTENSION_ID).toBe("nnolaedbmhibcffbjopphajjkbcnflln");
    expect(manifest.allowed_origins).toEqual([
      "chrome-extension://nnolaedbmhibcffbjopphajjkbcnflln/",
    ]);
  });

  it("validates narrow page-driver commands and rejects unscoped submission", () => {
    const valid = ExtensionMessageSchema.parse({
      type: "PAGE_DRIVER_SUBMIT",
      message: "[ASR/1] probe",
      expectedConversationId: "conversation-1",
    });
    expect(isContentScriptMessage(valid)).toBe(true);
    expect(() => ExtensionMessageSchema.parse({ type: "PAGE_DRIVER_SUBMIT", message: "probe" })).toThrow();
    expect(() => ExtensionMessageSchema.parse({ type: "PAGE_DRIVER_OBSERVE" })).toThrow();
    expect(() => ExtensionMessageSchema.parse({ type: "PAGE_DRIVER_GENERATION_STATE" })).toThrow();
    expect(() => ExtensionMessageSchema.parse({ type: "PAGE_DRIVER_HEALTH" })).toThrow();
    expect(() => ExtensionMessageSchema.parse({ type: "PAGE_DRIVER_SHELL", command: "whoami" })).toThrow();
  });
});
