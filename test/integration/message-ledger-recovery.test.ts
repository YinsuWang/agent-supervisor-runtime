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

describe("message ledger recovery", () => {
  it("recovers a SENT record without appending a duplicate", async () => {
    const root = await mkdtemp(join(tmpdir(), "asr-ledger-recovery-"));
    cleanup.push(root);
    const stateRoot = join(root, ".orchestrator");

    const firstStore = new FileStateStore(stateRoot);
    await firstStore.initialize("project_1");
    const firstLedger = new MessageLedger(firstStore);
    await firstLedger.append({
      messageId: "msg_1",
      bindingId: "bind_1",
      taskId: "task_1",
      runId: "run_1",
      kind: "REVIEW_REQUEST",
      direction: "outbound",
      sequence: 1,
      payloadHash: "sha256:abc",
    });
    await firstLedger.transition("msg_1", "CLAIMED");
    await firstLedger.transition("msg_1", "SENT");

    const recoveredStore = new FileStateStore(stateRoot);
    await recoveredStore.initialize("project_1");
    const recoveredLedger = new MessageLedger(recoveredStore);

    expect((await recoveredLedger.get("msg_1"))?.state).toBe("SENT");
    expect(await recoveredLedger.findPendingForBinding("bind_1")).toHaveLength(1);

    const duplicate = await recoveredLedger.append({
      messageId: "msg_1",
      bindingId: "bind_1",
      taskId: "task_1",
      runId: "run_1",
      kind: "REVIEW_REQUEST",
      direction: "outbound",
      sequence: 1,
      payloadHash: "sha256:abc",
    });
    expect(duplicate.state).toBe("SENT");
    expect(await recoveredStore.listMessageRecords()).toHaveLength(1);
  });
});
