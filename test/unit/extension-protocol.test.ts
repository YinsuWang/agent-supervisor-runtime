import { describe, expect, it } from "vitest";
import { createNativeHostManifest } from "../../src/setup/native-host-manifest.js";
import { DEVELOPMENT_EXTENSION_ID, conversationIdentityFromUrl } from "../../extension/src/protocol.js";

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
});
