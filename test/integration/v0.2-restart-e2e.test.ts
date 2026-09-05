import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildConversationRuntime } from "../../src/adapters/registry.js";
import { compileReviewPacket } from "../../src/chatgpt/review-packet.js";
import type { Task } from "../../src/contracts/task.js";
import type { WorkerResult } from "../../src/contracts/result.js";
import type { WorkerAdapter } from "../../src/contracts/worker.js";
import type { ConversationBinding } from "../../src/conversations/binding.js";
import type { ConversationTransport, ResponseRequest, TransportHealth, TransportMessage } from "../../src/conversations/transport.js";
import { ConversationReconciler } from "../../src/conversations/reconcile.js";
import { MessageLedger } from "../../src/conversations/message-ledger.js";
import { FileStateStore } from "../../src/stores/file/store.js";

const cleanup: string[] = [];
afterEach(async () => Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

describe("V0.2 restart reconciliation", () => {
  it("reconciles a persisted RESULT_READY/SENT exchange without rerunning or resending", async () => {
    const stateDirectory = await mkdtemp(join(tmpdir(), "asr-v02-restart-"));
    cleanup.push(stateDirectory);
    const worker = new CountingWorker();
    const transport = new RecoveredTransport();
    const first = buildConversationRuntime({ worker, binding, transport, stateDirectory, leaseEpoch: () => 3 });
    await first.store.initialize("project-v02");
    await first.store.saveTask(task);
    await first.store.saveRecord({
      taskId: task.taskId,
      projectId: task.projectId,
      state: "RESULT_READY",
      currentRunId: result.runId,
      revisionCount: 0,
      retryCount: 0,
      runCount: 1,
      updatedAt: "2026-09-04T00:00:00.000Z",
    });
    await first.store.saveWorkerResult(result.runId, result);
    const envelope = {
      protocolVersion: "ASR/1" as const,
      messageId: "persisted-review-request",
      bindingId: binding.bindingId,
      taskId: task.taskId,
      runId: result.runId,
      kind: "REVIEW_REQUEST" as const,
      sequence: 1,
    };
    const content = JSON.stringify({
      ...envelope,
      replyContract: {
        format: "JSON object only; no prose or Markdown",
        requiredFields: {
          protocolVersion: "ASR/1",
          messageId: "new unique message id",
          inReplyTo: envelope.messageId,
          bindingId: envelope.bindingId,
          taskId: envelope.taskId,
          runId: envelope.runId,
          kind: "REVIEW",
          decision: ["PASS", "REVISE", "ASK_USER"],
          findings: "array of strings",
        },
        instruction: "Evaluate payload against acceptanceCriteria and return exactly one correlated ASR/1 REVIEW object.",
      },
      payload: compileReviewPacket(task, result, {
        bindingId: binding.bindingId,
        taskId: task.taskId,
        runId: result.runId,
        available: [],
      }),
    });
    await first.ledger.append({
      messageId: envelope.messageId,
      bindingId: envelope.bindingId,
      taskId: envelope.taskId,
      runId: envelope.runId,
      kind: envelope.kind,
      direction: "outbound",
      sequence: envelope.sequence,
      payloadHash: createHash("sha256").update(content).digest("hex"),
    });
    await first.ledger.transition(envelope.messageId, "CLAIMED");
    await first.ledger.transition(envelope.messageId, "SENT");

    const recovered = buildConversationRuntime({ worker, binding, transport, stateDirectory, leaseEpoch: () => 4 });
    const record = await recovered.orchestrator.resume(task.taskId);
    const repeated = await recovered.orchestrator.resume(task.taskId);

    expect(record.state).toBe("COMPLETED");
    expect(repeated.state).toBe("COMPLETED");
    expect(worker.calls).toBe(0);
    expect(transport.sendCalls).toBe(0);
    expect(transport.waitCalls).toBe(1);
    expect((await recovered.ledger.get(envelope.messageId))?.state).toBe("CONSUMED");
    const recoveredReplies = (await recovered.store.listMessageRecords()).filter((entry) => entry.messageId === "recovered-review");
    expect(recoveredReplies).toHaveLength(1);
    expect(recoveredReplies[0]?.sequence).toBeGreaterThan(envelope.sequence);
  });

  it("deduplicates repeated observations and ignores a reply from the wrong binding", async () => {
    const stateDirectory = await mkdtemp(join(tmpdir(), "asr-v02-observations-"));
    cleanup.push(stateDirectory);
    const store = new FileStateStore(stateDirectory);
    await store.initialize("project-v02");
    const ledger = new MessageLedger(store);
    await ledger.append({
      messageId: "request-1",
      bindingId: binding.bindingId,
      taskId: task.taskId,
      runId: result.runId,
      kind: "REVIEW_REQUEST",
      direction: "outbound",
      sequence: 1,
      payloadHash: "hash",
    });
    await ledger.transition("request-1", "CLAIMED");
    await ledger.transition("request-1", "SENT");
    const validResponse = {
      type: "response" as const,
      messageId: "response-1",
      inReplyTo: "request-1",
      bindingId: binding.bindingId,
      taskId: task.taskId,
      runId: result.runId,
    };
    const reconciler = new ConversationReconciler(ledger);

    const observed = await reconciler.reconcile(binding.bindingId, [
      { ...validResponse, messageId: "wrong-binding-response", bindingId: "other-binding" },
      validResponse,
      validResponse,
    ]);
    const repeated = await reconciler.reconcile(binding.bindingId, [validResponse]);

    expect(observed).toEqual([validResponse]);
    expect(repeated).toEqual([]);
    expect((await ledger.get("request-1"))?.state).toBe("RESPONDED");
  });
});

const binding: ConversationBinding = {
  bindingId: "binding-v02",
  workspaceId: "workspace-v02",
  conversationId: "conversation-v02",
  conversationUrl: "https://chatgpt.com/c/conversation-v02",
  preferredTransport: "chrome-extension",
  createdAt: "2026-09-04T00:00:00.000Z",
};

const task: Task = {
  taskId: "task-v02",
  projectId: "project-v02",
  objective: "recover the supervisor exchange",
  instructions: ["do not rerun completed work"],
  acceptanceCriteria: ["consume the observed reply"],
  execution: { workingDirectory: "." },
};

const result: WorkerResult = {
  runId: "run-persisted",
  taskId: task.taskId,
  status: "completed",
  summary: "persisted worker result",
  changedFiles: [],
  commands: [],
  verification: [],
  artifacts: [],
  machineEvidence: { processExitCode: 0, timedOut: false },
  startedAt: "2026-09-04T00:00:00.000Z",
  completedAt: "2026-09-04T00:01:00.000Z",
};

class CountingWorker implements WorkerAdapter {
  readonly name = "counting";
  calls = 0;
  async execute(): Promise<WorkerResult> { this.calls += 1; return result; }
  async cancel(): Promise<void> {}
}

class RecoveredTransport implements ConversationTransport {
  readonly id = "recovered";
  sendCalls = 0;
  waitCalls = 0;
  async connect(): Promise<void> {}
  async send(_message: TransportMessage): Promise<void> { this.sendCalls += 1; }
  async waitForResponse(request: ResponseRequest) {
    this.waitCalls += 1;
    return { content: JSON.stringify({
      protocolVersion: "ASR/1",
      messageId: "recovered-review",
      inReplyTo: request.inReplyTo,
      bindingId: binding.bindingId,
      taskId: task.taskId,
      runId: result.runId,
      kind: "REVIEW",
      decision: "PASS",
      findings: [],
    }) };
  }
  async health(): Promise<TransportHealth> { return { status: "ACTIVE" }; }
  async disconnect(): Promise<void> {}
}
