import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ExtensionMessageSchema } from "../../extension/src/protocol.js";
import { WorkspacePolicy } from "../../src/context/workspace-policy.js";
import { InMemoryTransportLeaseStore, TransportLeaseCoordinator } from "../../src/conversations/lease.js";
import { TransportManager } from "../../src/conversations/transport-manager.js";
import type { ConversationTransport, TransportHealth } from "../../src/conversations/transport.js";
import { parseBrowserRuntimeFrame } from "../../src/native-host/bridge.js";

const tempDirs: string[] = [];
afterEach(async () => Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))));

describe("V0.2 security boundaries", () => {
  it("rejects browser and extension shell commands before runtime dispatch", () => {
    expect(() => ExtensionMessageSchema.parse({ type: "PAGE_DRIVER_SHELL", command: "whoami" })).toThrow();
    expect(() => parseBrowserRuntimeFrame(frame({ name: "RUN_SHELL", command: "whoami" }))).toThrow(/unsupported browser command/i);
    expect(() => parseBrowserRuntimeFrame(frame({
      name: "BIND_CONVERSATION",
      conversationId: "expected",
      conversationUrl: "https://chatgpt.com/c/expected",
      command: "whoami",
    }))).toThrow();
  });

  it("rejects a binding whose conversation URL does not match its explicit identity", () => {
    expect(() => parseBrowserRuntimeFrame(frame({
      name: "BIND_CONVERSATION",
      conversationId: "expected",
      conversationUrl: "https://chatgpt.com/c/different",
    }))).toThrow(/invalid BIND_CONVERSATION identity/i);
  });

  it("rejects lexical and symlink workspace escapes", async () => {
    const parent = await mkdtemp(join(tmpdir(), "asr-security-"));
    tempDirs.push(parent);
    const workspace = join(parent, "workspace");
    const outside = join(parent, "outside");
    await mkdir(workspace);
    await mkdir(outside);
    await writeFile(join(outside, "secret.txt"), "secret", "utf8");
    await symlink(outside, join(workspace, "escape"), process.platform === "win32" ? "junction" : "dir");
    const policy = await WorkspacePolicy.create(workspace);

    await expect(policy.resolvePath("../outside/secret.txt")).rejects.toMatchObject({ code: "CONTEXT_POLICY_VIOLATION" });
    await expect(policy.resolvePath("escape/secret.txt")).rejects.toMatchObject({ code: "CONTEXT_POLICY_VIOLATION" });
  });

  it("rejects an obsolete lease epoch after failover", async () => {
    let now = new Date("2026-01-01T00:00:00.000Z");
    const manager = new TransportManager(
      new TransportLeaseCoordinator(new InMemoryTransportLeaseStore(), () => now),
      100,
    );
    manager.register(fakeTransport("chrome"), 20);
    manager.register(fakeTransport("background"), 10);
    const oldLease = await manager.acquire("binding-1", "chrome");
    now = new Date("2026-01-01T00:00:00.200Z");
    await manager.acquire("binding-1", "background");

    await expect(manager.assertSendAuthority("binding-1", "chrome", oldLease!.epoch)).rejects.toMatchObject({ code: "STALE_LEASE" });
  });
});

function frame(payload: unknown) {
  return {
    protocol: "ASR-NM/1",
    frameId: "frame-1",
    type: "COMMAND",
    sessionId: "session-1",
    timestamp: "2026-09-04T00:00:00.000Z",
    payload,
  };
}

function fakeTransport(id: string): ConversationTransport {
  return {
    id,
    connect: async () => {},
    send: async () => {},
    waitForResponse: async () => ({ content: "" }),
    health: async (): Promise<TransportHealth> => ({ status: "STANDBY" }),
    disconnect: async () => {},
  };
}
