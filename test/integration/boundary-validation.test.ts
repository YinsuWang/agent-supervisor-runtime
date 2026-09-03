import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Orchestrator } from "../../src/core/orchestrator.js";
import { FileStateStore } from "../../src/stores/file/store.js";
import { MockSupervisorAdapter } from "../../src/supervisors/mock/adapter.js";
import type { WorkerAdapter, WorkerExecutionContext } from "../../src/contracts/worker.js";
import type { Task } from "../../src/contracts/task.js";
import type { WorkerResult } from "../../src/contracts/result.js";

const task: Task = {
  taskId: "TASK-1",
  projectId: "demo",
  objective: "validate runtime boundaries",
  instructions: ["work"],
  acceptanceCriteria: ["boundaries are enforced"],
  execution: { workingDirectory: "." }
};

class MisidentifiedWorker implements WorkerAdapter {
  readonly name = "misidentified";

  async execute(_task: Task, _context: WorkerExecutionContext): Promise<WorkerResult> {
    const now = new Date().toISOString();
    return {
      runId: "OTHER-RUN",
      taskId: "OTHER-TASK",
      status: "completed",
      summary: "wrong identity",
      changedFiles: [],
      commands: [],
      verification: [],
      artifacts: [],
      machineEvidence: { processExitCode: 0, timedOut: false },
      startedAt: now,
      completedAt: now
    };
  }

  async cancel(): Promise<void> {}
}

describe("runtime boundary validation", () => {
  it("rejects unsafe state identifiers before filesystem access", async () => {
    const root = await mkdtemp(join(tmpdir(), "asr-safe-path-"));
    const store = new FileStateStore(root);
    await store.initialize("demo");

    await expect(store.loadTask("../../escape")).rejects.toThrow(/unsafe state identifier/i);
    await expect(store.getRunDirectory("../escape")).rejects.toThrow(/unsafe state identifier/i);
  });

  it("blocks a worker result for another task/run", async () => {
    const root = await mkdtemp(join(tmpdir(), "asr-worker-identity-"));
    const orchestrator = new Orchestrator({
      worker: new MisidentifiedWorker(),
      supervisor: new MockSupervisorAdapter([]),
      store: new FileStateStore(root),
      runId: () => "RUN-1"
    });

    const record = await orchestrator.run(task);
    expect(record.state).toBe("BLOCKED");
    expect(record.blockedReason).toBe("WORKER_RESULT_INVALID");
  });
});
