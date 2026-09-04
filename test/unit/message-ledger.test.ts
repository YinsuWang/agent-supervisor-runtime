import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MessageLedger } from "../../src/conversations/message-ledger.js";
import { FileStateStore } from "../../src/stores/file/store.js";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function createLedger() {
  const root = await mkdtemp(join(tmpdir(), "asr-ledger-"));
  cleanup.push(root);
  const store = new FileStateStore(join(root, ".orchestrator"));
  await store.initialize("project_1");
  return new MessageLedger(store, () => new Date("2026-09-03T00:00:00.000Z"));
}

const message = {
  messageId: "msg_1",
  bindingId: "bind_1",
  taskId: "task_1",
  runId: "run_1",
  kind: "REVIEW_REQUEST",
  direction: "outbound" as const,
  sequence: 1,
  payloadHash: "sha256:abc",
};

describe("MessageLedger", () => {
  it("treats an identical duplicate append as idempotent", async () => {
    const ledger = await createLedger();
    const first = await ledger.append(message);
    const second = await ledger.append(message);

    expect(second).toEqual(first);
    expect(second.state).toBe("PENDING");
  });

  it("rejects conflicting reuse of a message id", async () => {
    const ledger = await createLedger();
    await ledger.append(message);

    await expect(ledger.append({ ...message, payloadHash: "sha256:different" })).rejects.toThrow(
      "Conflicting reuse of messageId",
    );
  });

  it("rejects invalid state transitions", async () => {
    const ledger = await createLedger();
    await ledger.append(message);

    await expect(ledger.transition("msg_1", "CONSUMED")).rejects.toThrow(
      "Invalid message transition: PENDING -> CONSUMED",
    );
  });

  it("supports the durable delivery lifecycle", async () => {
    const ledger = await createLedger();
    await ledger.append(message);

    for (const state of ["CLAIMED", "SENT", "OBSERVED", "RESPONDED", "CONSUMED"] as const) {
      expect((await ledger.transition("msg_1", state)).state).toBe(state);
    }
  });
});
