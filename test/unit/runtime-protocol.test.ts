import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  RuntimeFrameTypeSchema,
  RuntimeProtocolError,
  parseRuntimeFrame,
} from "../../src/runtime/contracts.js";
import { LengthPrefixedJsonDecoder, encodeLengthPrefixedJson } from "../../src/runtime/ipc.js";
import { acquireSingleInstanceLock } from "../../src/runtime/single-instance.js";

const tempDirs: string[] = [];
afterEach(async () => Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))));

describe("ASR-NM/1 runtime protocol", () => {
  it("accepts exactly the seven frame classes", () => {
    expect(RuntimeFrameTypeSchema.options).toEqual([
      "HELLO", "WELCOME", "COMMAND", "EVENT", "ACK", "ERROR", "HEARTBEAT",
    ]);
    for (const type of RuntimeFrameTypeSchema.options) {
      expect(parseRuntimeFrame({
        protocol: "ASR-NM/1",
        frameId: `frame_${type}`,
        type,
        timestamp: "2026-09-03T00:00:00.000Z",
      }).type).toBe(type);
    }
  });

  it("fails closed on an incompatible protocol", () => {
    try {
      parseRuntimeFrame({ protocol: "ASR-NM/999", frameId: "frame_1", type: "HELLO", timestamp: "2026-09-03T00:00:00.000Z" });
      throw new Error("expected protocol error");
    } catch (error) {
      expect(error).toBeInstanceOf(RuntimeProtocolError);
      expect((error as RuntimeProtocolError).code).toBe("PROTOCOL_INCOMPATIBLE");
    }
  });

  it("uses UTF-8 byte length and rejects malformed or oversized frames", () => {
    const encoded = encodeLengthPrefixedJson({ value: "你好" });
    expect(encoded.readUInt32LE(0)).toBe(Buffer.byteLength(JSON.stringify({ value: "你好" }), "utf8"));

    expect(() => encodeLengthPrefixedJson({ value: "12345" }, 4)).toThrow("IPC_FRAME_TOO_LARGE");

    const decoder = new LengthPrefixedJsonDecoder();
    const bad = Buffer.from("not-json", "utf8");
    const header = Buffer.alloc(4);
    header.writeUInt32LE(bad.length, 0);
    expect(() => decoder.push(Buffer.concat([header, bad]))).toThrow("IPC_FRAME_MALFORMED_JSON");
  });
});

describe("single runtime authority", () => {
  it("rejects a live second authority and recovers a stale lock", async () => {
    const home = await mkdtemp(join(tmpdir(), "asr-single-instance-"));
    tempDirs.push(home);

    const first = await acquireSingleInstanceLock(home, { pid: 111, isPidAlive: (pid) => pid === 111 });
    await expect(acquireSingleInstanceLock(home, { pid: 222, isPidAlive: (pid) => pid === 111 }))
      .rejects.toThrow("RUNTIME_ALREADY_RUNNING:111");
    await first.release();

    const stale = await acquireSingleInstanceLock(home, { pid: 333, isPidAlive: () => false });
    await stale.release();
    const recovered = await acquireSingleInstanceLock(home, { pid: 444, isPidAlive: () => false });
    await recovered.release();
  });
});
