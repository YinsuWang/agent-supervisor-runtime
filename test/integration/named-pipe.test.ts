import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RuntimeFrame } from "../../src/runtime/contracts.js";
import {
  NamedPipeIpcClient,
  NamedPipeIpcServer,
  runtimeEndpointForHome,
} from "../../src/runtime/named-pipe.js";

const tempDirs: string[] = [];
afterEach(async () => Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))));

function frame(frameId: string, type: RuntimeFrame["type"], payload?: unknown): RuntimeFrame {
  return {
    protocol: "ASR-NM/1",
    frameId,
    type,
    timestamp: "2026-09-03T00:00:00.000Z",
    payload,
  };
}

describe("runtime IPC endpoint", () => {
  it("derives a deterministic Windows named-pipe path from runtime home", () => {
    const first = runtimeEndpointForHome("C:\\Users\\test\\.asr", "win32");
    const second = runtimeEndpointForHome("C:\\Users\\test\\.asr", "win32");
    expect(first).toBe(second);
    expect(first).toMatch(/^\\\\\.\\pipe\\agent-supervisor-runtime-[0-9a-f]{16}$/);
  });
});

describe("named-pipe IPC", () => {
  it("echoes framed runtime messages and permits reconnect", async () => {
    const runtimeHome = await mkdtemp(join(tmpdir(), "asr-ipc-"));
    tempDirs.push(runtimeHome);
    const endpoint = runtimeEndpointForHome(runtimeHome);
    const server = new NamedPipeIpcServer(endpoint);
    await server.listen(async (received, connection) => {
      await connection.send(frame(`ack_${received.frameId}`, "ACK", { received: received.frameId }));
    });

    try {
      for (const requestId of ["one", "two"]) {
        let resolveAck!: (value: RuntimeFrame) => void;
        const ack = new Promise<RuntimeFrame>((resolve) => { resolveAck = resolve; });
        const client = new NamedPipeIpcClient(endpoint);
        const connection = await client.connect((received) => resolveAck(received));
        await connection.send(frame(`frame_${requestId}`, "COMMAND", { name: "PING" }));
        expect((await ack).payload).toEqual({ received: `frame_${requestId}` });
        await connection.close();
      }
    } finally {
      await server.close();
    }
  });
});
