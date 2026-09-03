import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MessageLedger } from "../../src/conversations/message-ledger.js";
import { ConversationReconciler } from "../../src/conversations/reconcile.js";
import { FileStateStore } from "../../src/stores/file/store.js";

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("conversation reconciliation", () => {
  it("advances SENT to RESPONDED from matching observations without redelivery", async () => {
    const directory = await mkdtemp(join(tmpdir(), "asr-reconcile-"));
    tempDirs.push(directory);
    const store = new FileStateStore(directory);
    await store.initialize("project_1");
    const ledger = new MessageLedger(store);

    await ledger.append({
      messageId: "msg_1",
      bindingId: "bind_1",
      taskId: "task_1",
      runId: "run_1",
      kind: "REVIEW_REQUEST",
      direction: "outbound",
      sequence: 1,
      payloadHash: "hash_1",
    });
    await ledger.transition("msg_1", "CLAIMED");
    await ledger.transition("msg_1", "SENT");

    let sendCalls = 0;
    const reconciler = new ConversationReconciler(ledger);
    const responses = await reconciler.reconcile("bind_1", [
      {
        type: "request",
        messageId: "msg_1",
        bindingId: "bind_1",
        taskId: "task_1",
        runId: "run_1",
      },
      {
        type: "response",
        messageId: "msg_2",
        inReplyTo: "msg_1",
        bindingId: "bind_1",
        taskId: "task_1",
        runId: "run_1",
        content: "reply",
      },
    ]);

    expect(sendCalls).toBe(0);
    expect(responses).toHaveLength(1);
    expect((await ledger.get("msg_1"))?.state).toBe("RESPONDED");
  });

  it("ignores cross-run and cross-binding observations", async () => {
    const directory = await mkdtemp(join(tmpdir(), "asr-reconcile-"));
    tempDirs.push(directory);
    const store = new FileStateStore(directory);
    await store.initialize("project_1");
    const ledger = new MessageLedger(store);

    await ledger.append({
      messageId: "msg_1",
      bindingId: "bind_1",
      taskId: "task_1",
      runId: "run_1",
      kind: "REVIEW_REQUEST",
      direction: "outbound",
      sequence: 1,
      payloadHash: "hash_1",
    });
    await ledger.transition("msg_1", "CLAIMED");
    await ledger.transition("msg_1", "SENT");

    const reconciler = new ConversationReconciler(ledger);
    await reconciler.reconcile("bind_1", [
      {
        type: "response",
        messageId: "msg_2",
        inReplyTo: "msg_1",
        bindingId: "bind_1",
        taskId: "task_1",
        runId: "run_wrong",
      },
    ]);

    expect((await ledger.get("msg_1"))?.state).toBe("SENT");
  });
});
