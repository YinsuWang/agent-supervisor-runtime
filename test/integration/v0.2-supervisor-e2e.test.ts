import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildConversationRuntime } from "../../src/adapters/registry.js";
import type { Task } from "../../src/contracts/task.js";
import type { WorkerResult } from "../../src/contracts/result.js";
import type { WorkerAdapter, WorkerExecutionContext } from "../../src/contracts/worker.js";
import type { ConversationBinding } from "../../src/conversations/binding.js";
import type {
  ConversationTransport,
  ResponseRequest,
  TransportHealth,
  TransportMessage,
  TransportResponse,
  TransportSendContext,
} from "../../src/conversations/transport.js";
import { ContextBroker } from "../../src/context/broker.js";
import { RuntimeEvidenceSource } from "../../src/context/sources/runtime-evidence.js";
import type {
  ChatGptPageDriver,
  GenerationState,
  MessageCursor,
  PageCompatibility,
  PageConversationIdentity,
  PageMessage,
  SubmitReceipt,
} from "../../src/page-driver/contracts.js";

const cleanup: string[] = [];
afterEach(async () => Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

describe("V0.2 durable supervisor end-to-end", () => {
  it("runs bind -> context-assisted REVISE -> second worker run -> PASS", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "asr-v02-workspace-"));
    const stateDirectory = await mkdtemp(join(tmpdir(), "asr-v02-state-"));
    cleanup.push(workspace, stateDirectory);
    const worker = new ScriptedWorker();
    const pageDriver = new DeterministicPageDriver();
    const transport = new ScriptedConversationTransport(pageDriver);
    const messageIds = ["out-review-1", "out-context-1", "out-review-2"];
    let runNumber = 0;
    const runtime = buildConversationRuntime({
      worker,
      binding,
      transport,
      stateDirectory,
      leaseEpoch: () => 7,
      messageId: () => messageIds.shift()!,
      nextSequence: (() => { let value = 0; return () => ++value; })(),
      runId: () => `run-${++runNumber}`,
      contextBroker: new ContextBroker({
        id: (() => { let value = 0; return () => `evidence-${++value}`; })(),
        runtimeEvidence: new RuntimeEvidenceSource({
          executionSummary: async () => "worker execution evidence",
          testSummary: async () => "all scripted checks passed",
        }),
      }),
    });

    const record = await runtime.orchestrator.run(task(workspace));

    expect(record).toMatchObject({ state: "COMPLETED", revisionCount: 1, runCount: 2 });
    expect(worker.calls).toHaveLength(2);
    expect(worker.calls[1]?.prompt).toContain("tighten the implementation");
    expect(transport.sent.map(({ parsed }) => parsed.kind)).toEqual([
      "REVIEW_REQUEST",
      "CONTEXT_RESPONSE",
      "REVIEW_REQUEST",
    ]);
    expect(transport.sent[1]?.parsed.payload).toMatchObject({ content: "worker execution evidence" });
    expect(pageDriver.submissions).toHaveLength(3);
    expect(await runtime.ledger.findPendingForBinding(binding.bindingId)).toEqual([]);
    const messages = await runtime.store.listMessageRecords();
    expect(messages).toHaveLength(6);
    expect(messages.every((entry) => entry.state === "CONSUMED")).toBe(true);
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

function task(workspace: string): Task {
  return {
    taskId: "task-v02",
    projectId: "project-v02",
    objective: "complete a durable supervised change",
    instructions: ["follow supervisor feedback"],
    acceptanceCriteria: ["second revision passes"],
    execution: { workingDirectory: workspace },
  };
}

class ScriptedWorker implements WorkerAdapter {
  readonly name = "scripted-v02-worker";
  readonly calls: WorkerExecutionContext[] = [];

  async execute(input: Task, context: WorkerExecutionContext): Promise<WorkerResult> {
    this.calls.push(context);
    const now = new Date().toISOString();
    return {
      runId: context.runId,
      taskId: input.taskId,
      status: "completed",
      summary: `completed worker run ${this.calls.length}`,
      changedFiles: ["src/change.ts"],
      commands: [],
      verification: [{ command: "npm test", passed: true, exitCode: 0, durationMs: 1 }],
      artifacts: [],
      machineEvidence: { processExitCode: 0, timedOut: false },
      startedAt: now,
      completedAt: now,
    };
  }

  async cancel(): Promise<void> {}
}

class ScriptedConversationTransport implements ConversationTransport {
  readonly id = "scripted-conversation";
  readonly sent: Array<{ message: TransportMessage; context: TransportSendContext; parsed: any }> = [];

  constructor(private readonly pageDriver: DeterministicPageDriver) {}

  async connect(): Promise<void> {}
  async send(message: TransportMessage, context: TransportSendContext): Promise<void> {
    this.sent.push({ message, context, parsed: JSON.parse(message.content) });
    await this.pageDriver.submitMessage(message.content);
  }
  async waitForResponse(request: ResponseRequest): Promise<TransportResponse> {
    const outbound = this.sent.find(({ message }) => message.messageId === request.inReplyTo)?.parsed;
    if (!outbound) throw new Error(`missing outbound ${request.inReplyTo}`);
    if (outbound.kind === "REVIEW_REQUEST" && outbound.runId === "task-v02-run-1") {
      return response({
        protocolVersion: "ASR/1",
        messageId: "in-context-1",
        inReplyTo: outbound.messageId,
        bindingId: outbound.bindingId,
        taskId: outbound.taskId,
        runId: outbound.runId,
        kind: "CONTEXT_REQUEST",
        ref: outbound.payload.evidence[0].ref,
      });
    }
    if (outbound.kind === "CONTEXT_RESPONSE") {
      return response({
        protocolVersion: "ASR/1",
        messageId: "in-review-1",
        inReplyTo: outbound.messageId,
        bindingId: outbound.bindingId,
        taskId: outbound.taskId,
        runId: outbound.runId,
        kind: "REVIEW",
        decision: "REVISE",
        findings: ["tighten the implementation"],
        instruction: "tighten the implementation",
      });
    }
    return response({
      protocolVersion: "ASR/1",
      messageId: "in-review-2",
      inReplyTo: outbound.messageId,
      bindingId: outbound.bindingId,
      taskId: outbound.taskId,
      runId: outbound.runId,
      kind: "REVIEW",
      decision: "PASS",
      findings: [],
    });
  }
  async health(): Promise<TransportHealth> { return { status: "ACTIVE" }; }
  async disconnect(): Promise<void> {}
}

class DeterministicPageDriver implements ChatGptPageDriver {
  readonly submissions: string[] = [];
  async inspectConversation(): Promise<PageConversationIdentity> {
    return { conversationId: binding.conversationId, conversationUrl: binding.conversationUrl };
  }
  async submitMessage(message: string): Promise<SubmitReceipt> {
    this.submissions.push(message);
    return { messageId: (JSON.parse(message) as { messageId: string }).messageId };
  }
  async *observeMessages(_cursor?: MessageCursor): AsyncIterable<PageMessage> {}
  async detectGenerationState(): Promise<GenerationState> { return "IDLE"; }
  async health(): Promise<PageCompatibility> {
    return {
      status: "COMPATIBLE",
      missing: [],
      conversationIdentity: true,
      composer: true,
      submit: true,
      assistantMessages: true,
      generationLifecycle: true,
    };
  }
}

function response(value: unknown): TransportResponse {
  return { content: JSON.stringify(value) };
}
