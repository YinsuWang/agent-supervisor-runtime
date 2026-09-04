import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ChatGPTSupervisorAdapter } from "../../src/chatgpt/supervisor-adapter.js";
import { SupervisorUnavailableError } from "../../src/contracts/supervisor.js";
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
import { FileStateStore } from "../../src/stores/file/store.js";

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const binding: ConversationBinding = {
  bindingId: "bind_1",
  workspaceId: "ws_1",
  conversationId: "conversation_1",
  conversationUrl: "https://chatgpt.com/c/conversation_1",
  preferredTransport: "chrome-extension",
  createdAt: "2026-09-03T00:00:00.000Z",
};

const task: Task = {
  taskId: "task_1",
  projectId: "project_1",
  objective: "Implement a feature",
  instructions: ["Make the change"],
  acceptanceCriteria: ["Tests pass"],
  execution: { workingDirectory: "." },
};

const result: WorkerResult = {
  runId: "run_1",
  taskId: "task_1",
  status: "completed",
  summary: "Done",
  changedFiles: ["src/example.ts"],
  commands: [],
  verification: [],
  artifacts: [],
  machineEvidence: { processExitCode: 0, timedOut: false },
  startedAt: "2026-09-03T00:00:00.000Z",
  completedAt: "2026-09-03T00:01:00.000Z",
};

class FakeTransport implements ConversationTransport {
  readonly id = "fake";
  readonly sent: Array<{ message: TransportMessage; context: TransportSendContext }> = [];

  constructor(
    private readonly response: (request: ResponseRequest) => string,
    private readonly failSend = false,
    private readonly failWait = false,
  ) {}

  async connect(_binding: ConversationBinding): Promise<void> {}
  async send(message: TransportMessage, context: TransportSendContext): Promise<void> {
    if (this.failSend) throw new Error("offline");
    this.sent.push({ message, context });
  }
  async waitForResponse(request: ResponseRequest): Promise<TransportResponse> {
    if (this.failWait) throw new Error("response unavailable");
    return { content: this.response(request) };
  }
  async health(): Promise<TransportHealth> {
    return { status: "ACTIVE" };
  }
  async disconnect(): Promise<void> {}
}

async function makeAdapter(transport: ConversationTransport) {
  const directory = await mkdtemp(join(tmpdir(), "asr-chatgpt-supervisor-"));
  tempDirs.push(directory);
  const store = new FileStateStore(directory);
  await store.initialize("project_1");
  const ledger = new MessageLedger(store);
  return {
    adapter: createAdapter(transport, ledger),
    ledger,
  };
}

function createAdapter(transport: ConversationTransport, ledger: MessageLedger): ChatGPTSupervisorAdapter {
  return new ChatGPTSupervisorAdapter({
    binding,
    transport,
    ledger,
    leaseEpoch: () => 14,
    messageId: () => "msg_request",
    nextSequence: () => 7,
  });
}

function reply(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    protocolVersion: "ASR/1",
    messageId: "msg_reply",
    inReplyTo: "msg_request",
    bindingId: "bind_1",
    taskId: "task_1",
    runId: "run_1",
    kind: "REVIEW",
    decision: "PASS",
    findings: [],
    ...overrides,
  });
}

describe("ChatGPTSupervisorAdapter", () => {
  it("accepts a fully correlated review and consumes its outbound ledger entry", async () => {
    const transport = new FakeTransport(() => reply());
    const { adapter, ledger } = await makeAdapter(transport);

    const review = await adapter.requestReview({ task, result, revisionNumber: 0 });

    expect(review).toMatchObject({ taskId: "task_1", runId: "run_1", decision: "PASS" });
    expect(transport.sent[0]?.context.leaseEpoch).toBe(14);
    expect((await ledger.get("msg_request"))?.state).toBe("CONSUMED");
  });

  it.each([
    ["bindingId", "bind_wrong"],
    ["taskId", "task_wrong"],
    ["runId", "run_wrong"],
    ["inReplyTo", "msg_wrong"],
  ])("rejects a reply with wrong %s", async (field, value) => {
    const transport = new FakeTransport(() => reply({ [field]: value }));
    const { adapter } = await makeAdapter(transport);
    await expect(adapter.requestReview({ task, result, revisionNumber: 0 })).rejects.toThrow(
      "Supervisor reply correlation mismatch",
    );
  });

  it("surfaces transport failure as supervisor unavailability and returns the claim to PENDING", async () => {
    const transport = new FakeTransport(() => reply(), true);
    const { adapter, ledger } = await makeAdapter(transport);

    await expect(adapter.requestReview({ task, result, revisionNumber: 0 })).rejects.toBeInstanceOf(
      SupervisorUnavailableError,
    );
    expect((await ledger.get("msg_request"))?.state).toBe("PENDING");
  });

  it("reuses a persisted SENT request after response recovery without redelivery", async () => {
    const firstTransport = new FakeTransport(() => reply(), false, true);
    const { adapter: firstAdapter, ledger } = await makeAdapter(firstTransport);

    await expect(firstAdapter.requestReview({ task, result, revisionNumber: 0 })).rejects.toBeInstanceOf(
      SupervisorUnavailableError,
    );
    expect(firstTransport.sent).toHaveLength(1);
    expect((await ledger.get("msg_request"))?.state).toBe("SENT");

    const recoveredTransport = new FakeTransport(() => reply());
    const recoveredAdapter = createAdapter(recoveredTransport, ledger);
    const review = await recoveredAdapter.requestReview({ task, result, revisionNumber: 0 });

    expect(review.decision).toBe("PASS");
    expect(recoveredTransport.sent).toHaveLength(0);
    expect((await ledger.get("msg_request"))?.state).toBe("CONSUMED");
  });
});
