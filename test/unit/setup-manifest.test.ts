import { describe, expect, it } from "vitest";
import { createNativeHostManifest, NativeHostManifestSchema } from "../../src/setup/native-host-manifest.js";

describe("native host manifest", () => {
  it("uses stdio and exactly one stable extension origin", () => {
    const manifest = createNativeHostManifest({
      path: "C:\\Program Files\\ASR\\asr-native-host.exe",
      extensionId: "abcdefghijklmnopabcdefghijklmnop",
    });
    expect(manifest).toEqual({
      name: "com.agent_supervisor_runtime",
      description: "Agent Supervisor Runtime native messaging bridge",
      path: "C:\\Program Files\\ASR\\asr-native-host.exe",
      type: "stdio",
      allowed_origins: ["chrome-extension://abcdefghijklmnopabcdefghijklmnop/"],
    });
    expect(NativeHostManifestSchema.parse(manifest)).toEqual(manifest);
  });

  it("rejects missing, malformed, and wildcard extension identities", () => {
    expect(() => createNativeHostManifest({ path: "host.exe", extensionId: "" })).toThrow();
    expect(() => createNativeHostManifest({ path: "host.exe", extensionId: "*" })).toThrow();
    expect(() => createNativeHostManifest({ path: "host.exe", extensionId: "aaaaaaaa" })).toThrow();
  });
});
