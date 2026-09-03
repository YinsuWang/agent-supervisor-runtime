import { describe, expect, it } from "vitest";
import {
  MAX_NATIVE_HOST_OUTPUT_BYTES,
  NativeMessageDecoder,
  encodeNativeMessage,
} from "../../src/native-host/framing.js";

describe("Chrome Native Messaging framing", () => {
  it("prefixes UTF-8 JSON with a 32-bit little-endian native length", () => {
    const encoded = encodeNativeMessage({ text: "你好" });
    const expected = Buffer.byteLength(JSON.stringify({ text: "你好" }), "utf8");
    expect(encoded.readUInt32LE(0)).toBe(expected);
    expect(JSON.parse(encoded.subarray(4).toString("utf8"))).toEqual({ text: "你好" });
  });

  it("rejects host output above Chrome's 1 MiB limit", () => {
    expect(() => encodeNativeMessage({ text: "x".repeat(MAX_NATIVE_HOST_OUTPUT_BYTES) }))
      .toThrow("NATIVE_MESSAGE_TOO_LARGE");
  });

  it("rejects malformed JSON input", () => {
    const payload = Buffer.from("not-json", "utf8");
    const header = Buffer.alloc(4);
    header.writeUInt32LE(payload.length, 0);
    const decoder = new NativeMessageDecoder();
    expect(() => decoder.push(Buffer.concat([header, payload]))).toThrow("NATIVE_MESSAGE_MALFORMED_JSON");
  });
});
