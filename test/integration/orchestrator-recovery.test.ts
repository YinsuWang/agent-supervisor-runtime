import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Orchestrator } from "../../src/core/orchestrator.js";
import { FileStateStore } from "../../src/stores/file/store.js";
import { MockSupervisorAdapter } from "../../src/supervisors/mock/adapter.js";
import type { WorkerAdapter } from "../../src/contracts/worker.js";
import type { Task } from "../../src/contracts/task.js";

const task: Task = { taskId: "TASK-1", projectId: "demo", objective: "recover", instructions: ["work"], acceptanceCriteria: ["done"], execution: { workingDirectory: "." } };

class CountingWorker implements WorkerAdapter {
  readonly name = "counting";
  calls = 0;
  async execute(): Promise<any> { this.calls++; throw new Error("should not execute"); }
  async cancel(): Promise<void> {}
}

describe("Orchestrator recovery", () => {
  it("reviews a persisted result without rerunning the worker", async () => {
    const root = await mkdtemp(join(tmpdir(), "asr-recover-result-"));
    const store = new FileStateStore(root);
    await store.initialize("demo");
    await store.saveTask(task);
    await store.saveRecord({ taskId: "TASK-1", projectId: "demo", state: "RESULT_READY", currentRunId: "RUN-1", revisionCount: 0, retryCount: 0, runCount: 1, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    await store.saveWorkerResult("RUN-1", { runId: "RUN-1", taskId: "TASK-1", status: "completed", summary: "done", changedFiles: [], commands: [], verification: [], artifacts: [], machineEvidence: { processExitCode: 0, timedOut: false }, startedAt: new Date().toISOString(), completedAt: new Date().toISOString() });
    const worker = new CountingWorker();
    const supervisor = new MockSupervisorAdapter([{ taskId: "TASK-1", runId: "RUN-1", decision: "PASS", summary: "ok", findings: [] }]);
    const record = await new Orchestrator({ worker, supervisor, store }).resume("TASK-1");
    expect(record.state).toBe("COMPLETED");
    expect(worker.calls).toBe(0);
  });

  it("applies a persisted review without requesting another review", async () => {
    const root = await mkdtemp(join(tmpdir(), "asr-recover-review-"));
    const store = new FileStateStore(root);
    await store.initialize("demo");
    await store.saveTask(task);
    await store.saveRecord({ taskId: "TASK-1", projectId: "demo", state: "REVIEWING", currentRunId: "RUN-1", revisionCount: 0, retryCount: 0, runCount: 1, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    await store.saveWorkerResult("RUN-1", { runId: "RUN-1", taskId: "TASK-1", status: "completed", summary: "done", changedFiles: [], commands: [], verification: [], artifacts: [], machineEvidence: { processExitCode: 0, timedOut: false }, startedAt: new Date().toISOString(), completedAt: new Date().toISOString() });
    await store.saveReview("RUN-1", { taskId: "TASK-1", runId: "RUN-1", decision: "PASS", summary: "persisted", findings: [] });
    const supervisor = new MockSupervisorAdapter([]);
    const record = await new Orchestrator({ worker: new CountingWorker(), supervisor, store }).resume("TASK-1");
    expect(record.state).toBe("COMPLETED");
  });
});
