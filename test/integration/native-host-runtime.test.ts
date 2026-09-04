import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import type { RuntimeFrame } from "../../src/runtime/contracts.js";
import { RuntimeDaemon } from "../../src/runtime/daemon.js";
import { NamedPipeIpcClient, runtimeEndpointForHome } from "../../src/runtime/named-pipe.js";
import { NativeHostBridge } from "../../src/native-host/bridge.js";
import { NativeMessageDecoder, encodeNativeMessage } from "../../src/native-host/framing.js";

const tempDirs: string[] = [];
afterEach(async () => Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))));

function frame(frameId: string, type: RuntimeFrame["type"], payload?: unknown, sessionId?: string): RuntimeFrame {
  return { protocol: "ASR-NM/1", frameId, type, sessionId, timestamp: "2026-09-03T00:00:00.000Z", payload };
}

describe("native host runtime bridge", () => {
  it("lazy-starts runtime and forwards HELLO/WELCOME then COMMAND/ACK", async () => {
    const runtimeHome = await mkdtemp(join(tmpdir(), "asr-native-host-runtime-"));
    tempDirs.push(runtimeHome);
    const daemon = new RuntimeDaemon({
      runtimeHome,
      runtimeVersion: "0.2.0-test",
      runtimeInstanceId: "runtime_test",
      commandHandler: (command) => ({ echoed: command.payload }),
    });
    let starts = 0;
    const input = new PassThrough();
    const output = new PassThrough();
    const observed: RuntimeFrame[] = [];
    const decoder = new NativeMessageDecoder();
    const waiters: Array<{ type: RuntimeFrame["type"]; resolve: (frame: RuntimeFrame) => void }> = [];
    output.on("data", (chunk) => {
      for (const raw of decoder.push(Buffer.from(chunk))) {
        const received = raw as RuntimeFrame;
        observed.push(received);
        const index = waiters.findIndex((waiter) => waiter.type === received.type);
        if (index >= 0) waiters.splice(index, 1)[0]!.resolve(received);
      }
    });
    const waitFor = (type: RuntimeFrame["type"]): Promise<RuntimeFrame> => {
      const existing = observed.find((item) => item.type === type);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve) => waiters.push({ type, resolve }));
    };

    const bridge = new NativeHostBridge({
      input,
      output,
      runtimeClient: new NamedPipeIpcClient(runtimeEndpointForHome(runtimeHome)),
      startRuntime: async () => { starts += 1; await daemon.start(); },
      connectAttempts: 3,
      retryDelayMs: 0,
      sleep: async () => {},
    });

    try {
      await bridge.start();
      input.write(encodeNativeMessage(frame("frame_hello", "HELLO", {
        extensionInstanceId: "extinst_test",
        extensionVersion: "0.2.0",
        capabilities: ["conversation-send"],
      })));
      const welcome = await waitFor("WELCOME");
      expect(starts).toBe(1);
      expect(welcome.payload).toMatchObject({ runtimeInstanceId: "runtime_test", status: "READY" });
      expect(JSON.parse(await readFile(join(runtimeHome, "health", "extension-session.json"), "utf8")))
        .toMatchObject({ protocol: "ASR-NM/1", extensionVersion: "0.2.0", runtimeInstanceId: "runtime_test" });

      input.write(encodeNativeMessage(frame("frame_command", "COMMAND", {
        name: "BIND_CONVERSATION",
        conversationId: "conversation-1",
        conversationUrl: "https://chatgpt.com/c/conversation-1",
      }, welcome.sessionId)));
      const ack = await waitFor("ACK");
      expect(ack.payload).toMatchObject({
        inReplyTo: "frame_command",
        result: { echoed: { name: "BIND_CONVERSATION", conversationId: "conversation-1" } },
      });
    } finally {
      await bridge.stop();
      await daemon.stop();
    }
  });
});
