import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Orchestrator } from "../../src/core/orchestrator.js";
import { PolicyEngine } from "../../src/core/policy-engine.js";
import { FileStateStore } from "../../src/stores/file/store.js";
import { MockSupervisorAdapter } from "../../src/supervisors/mock/adapter.js";
import type { WorkerAdapter, WorkerExecutionContext } from "../../src/contracts/worker.js";
import type { Task } from "../../src/contracts/task.js";
import type { WorkerResult } from "../../src/contracts/result.js";

class ScriptedWorker implements WorkerAdapter {
  readonly name = "scripted";
  calls: WorkerExecutionContext[] = [];
  constructor(private readonly statuses: Array<"completed" | "failed"> = ["completed"]) {}
  async execute(task: Task, context: WorkerExecutionContext): Promise<WorkerResult> {
    this.calls.push(context);
    const status = this.statuses.shift() ?? "completed";
    return { runId: context.runId, taskId: task.taskId, status, summary: status, changedFiles: [], commands: [], verification: [], artifacts: [], machineEvidence: { processExitCode: status === "completed" ? 0 : 1, timedOut: false }, startedAt: new Date().toISOString(), completedAt: new Date().toISOString() };
  }
  async cancel(): Promise<void> {}
}

const task = (): Task => ({ taskId: "TASK-1", projectId: "demo", objective: "demo", instructions: ["work"], acceptanceCriteria: ["done"], execution: { workingDirectory: "." } });
const pass = (runId = "placeholder") => ({ taskId: "TASK-1", runId, decision: "PASS" as const, summary: "approved", findings: [] });
const revise = (runId = "placeholder", fingerprint = "quality:missing") => ({ taskId: "TASK-1", runId, decision: "REVISE" as const, summary: "revise", findings: [{ severity: "major" as const, category: "quality", message: "missing", fingerprint }], revisionInstructions: ["fix it"] });

function supervisorWithDynamicRun(reviews: Array<ReturnType<typeof pass> | ReturnType<typeof revise>>) {
  return {
    name: "dynamic",
    async requestReview(input: any) {
      const next = reviews.shift()!;
      return { ...next, runId: input.result.runId };
    }
  };
}

describe("Orchestrator loop", () => {
  it("completes a PASS flow", async () => {
    const root = await mkdtemp(join(tmpdir(), "asr-loop-"));
    const worker = new ScriptedWorker();
    const orchestrator = new Orchestrator({ worker, supervisor: supervisorWithDynamicRun([pass()]), store: new FileStateStore(root), runId: () => "RUN-1" });
    const record = await orchestrator.run(task());
    expect(record.state).toBe("COMPLETED");
    expect(worker.calls).toHaveLength(1);
  });

  it("revises then passes with a revision prompt", async () => {
    const root = await mkdtemp(join(tmpdir(), "asr-revise-"));
    const worker = new ScriptedWorker();
    let id = 0;
    const orchestrator = new Orchestrator({ worker, supervisor: supervisorWithDynamicRun([revise(), pass()]), store: new FileStateStore(root), runId: () => `RUN-${++id}` });
    const record = await orchestrator.run(task());
    expect(record.state).toBe("COMPLETED");
    expect(record.revisionCount).toBe(1);
    expect(worker.calls).toHaveLength(2);
    expect(worker.calls[1]!.prompt).toContain("fix it");
  });

  it("retries technical failures independently", async () => {
    const root = await mkdtemp(join(tmpdir(), "asr-retry-"));
    const worker = new ScriptedWorker(["failed", "completed"]);
    let id = 0;
    const orchestrator = new Orchestrator({ worker, supervisor: supervisorWithDynamicRun([pass()]), store: new FileStateStore(root), policy: new PolicyEngine({ maxRevisions: 3, maxWorkerRetries: 2 }), runId: () => `RUN-${++id}` });
    const record = await orchestrator.run(task());
    expect(record.state).toBe("COMPLETED");
    expect(record.retryCount).toBe(1);
    expect(record.revisionCount).toBe(0);
  });

  it("blocks repeated unresolved findings", async () => {
    const root = await mkdtemp(join(tmpdir(), "asr-repeat-"));
    const worker = new ScriptedWorker();
    let id = 0;
    const orchestrator = new Orchestrator({ worker, supervisor: supervisorWithDynamicRun([revise(), revise()]), store: new FileStateStore(root), runId: () => `RUN-${++id}` });
    const record = await orchestrator.run(task());
    expect(record.state).toBe("BLOCKED");
    expect(record.blockedReason).toBe("REPEATED_UNRESOLVED_FINDING");
  });

  it("blocks invalid supervisor responses", async () => {
    const root = await mkdtemp(join(tmpdir(), "asr-invalid-"));
    const orchestrator = new Orchestrator({ worker: new ScriptedWorker(), supervisor: new MockSupervisorAdapter([{ nonsense: true }]), store: new FileStateStore(root), runId: () => "RUN-1" });
    const record = await orchestrator.run(task());
    expect(record.state).toBe("BLOCKED");
    expect(record.blockedReason).toBe("SUPERVISOR_RESPONSE_INVALID");
  });
});
