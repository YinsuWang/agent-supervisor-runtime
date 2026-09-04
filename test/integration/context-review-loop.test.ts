import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ChatGPTSupervisorAdapter } from "../../src/chatgpt/supervisor-adapter.js";
import type { Task } from "../../src/contracts/task.js";
import type { WorkerResult } from "../../src/contracts/result.js";
import { MessageLedger } from "../../src/conversations/message-ledger.js";
import type {
  ConversationTransport,
  ResponseRequest,
  TransportHealth,
  TransportMessage,
  TransportResponse,
  TransportSendContext,
} from "../../src/conversations/transport.js";
import type { ConversationBinding } from "../../src/conversations/binding.js";
import { ContextBroker } from "../../src/context/broker.js";
import { RuntimeEvidenceSource } from "../../src/context/sources/runtime-evidence.js";
import { FileStateStore } from "../../src/stores/file/store.js";

const tempDirs: string[] = [];
afterEach(async () => Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))));

const binding: ConversationBinding = {
  bindingId: "bind_1",
  workspaceId: "ws_1",
  conversationId: "conversation_1",
  conversationUrl: "https://chatgpt.com/c/conversation_1",
  preferredTransport: "chrome-extension",
  createdAt: "2026-09-03T00:00:00.000Z",
};

function task(workspace: string): Task {
  return {
    taskId: "task_1",
    projectId: "project_1",
    objective: "Implement context review loop",
    instructions: ["Use compact evidence"],
    acceptanceCriteria: ["Context can be fetched on demand"],
    execution: { workingDirectory: workspace },
  };
}

const result: WorkerResult = {
  runId: "run_1",
  taskId: "task_1",
  status: "completed",
  summary: "Done",
  changedFiles: ["src/example.ts"],
  commands: [],
  verification: [{ command: "npm test", passed: true, exitCode: 0, durationMs: 5 }],
  artifacts: [],
  machineEvidence: { processExitCode: 0, timedOut: false },
  startedAt: "2026-09-03T00:00:00.000Z",
  completedAt: "2026-09-03T00:01:00.000Z",
};

class ContextLoopTransport implements ConversationTransport {
  readonly id = "fake";
  readonly sent: Array<{ message: TransportMessage; context: TransportSendContext }> = [];
  private contextRef?: string;

  async connect(): Promise<void> {}
  async send(message: TransportMessage, context: TransportSendContext): Promise<void> {
    this.sent.push({ message, context });
    const parsed = JSON.parse(message.content) as Record<string, unknown>;
    if (parsed.kind === "REVIEW_REQUEST") {
      const payload = parsed.payload as { evidence: Array<{ ref: string }> };
      this.contextRef = payload.evidence[0]?.ref;
    }
  }
  async waitForResponse(request: ResponseRequest): Promise<TransportResponse> {
    if (request.inReplyTo === "msg_review_request") {
      return { content: JSON.stringify({
        protocolVersion: "ASR/1",
        messageId: "msg_context_request",
        inReplyTo: "msg_review_request",
        bindingId: "bind_1",
        taskId: "task_1",
        runId: "run_1",
        kind: "CONTEXT_REQUEST",
        ref: this.contextRef,
      }) };
    }
    if (request.inReplyTo === "msg_context_response") {
      return { content: JSON.stringify({
        protocolVersion: "ASR/1",
        messageId: "msg_review",
        inReplyTo: "msg_context_response",
        bindingId: "bind_1",
        taskId: "task_1",
        runId: "run_1",
        kind: "REVIEW",
        decision: "PASS",
        findings: [],
      }) };
    }
    throw new Error(`unexpected response request: ${request.inReplyTo}`);
  }
  async health(): Promise<TransportHealth> { return { status: "ACTIVE" }; }
  async disconnect(): Promise<void> {}
}

describe("context review loop", () => {
  it("persists and consumes review request, context request, context response, and terminal review exactly once", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "asr-context-loop-workspace-"));
    const stateDir = await mkdtemp(join(tmpdir(), "asr-context-loop-state-"));
    tempDirs.push(workspace, stateDir);

    const store = new FileStateStore(stateDir);
    await store.initialize("project_1");
    const ledger = new MessageLedger(store);
    const broker = new ContextBroker({
      runtimeEvidence: new RuntimeEvidenceSource({
        async executionSummary() { return "Execution summary evidence"; },
        async testSummary() { return "1 passed, 0 failed"; },
      }),
      id: (() => { let n = 0; return () => `ref_${++n}`; })(),
    });
    const transport = new ContextLoopTransport();
    const ids = ["msg_review_request", "msg_context_response"];
    const adapter = new ChatGPTSupervisorAdapter({
      binding,
      transport,
      ledger,
      contextBroker: broker,
      leaseEpoch: () => 14,
      messageId: () => ids.shift() ?? "msg_unexpected",
      nextSequence: (() => { let n = 1; return () => n++; })(),
    });

    const review = await adapter.requestReview({ task: task(workspace), result, revisionNumber: 0 });
    expect(review.decision).toBe("PASS");
    expect(transport.sent).toHaveLength(2);

    for (const id of ["msg_review_request", "msg_context_request", "msg_context_response", "msg_review"]) {
      expect((await ledger.get(id))?.state).toBe("CONSUMED");
    }
    expect((await ledger.get("msg_context_request"))?.direction).toBe("inbound");
    expect((await ledger.get("msg_context_response"))?.direction).toBe("outbound");
  });
});
