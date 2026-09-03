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

class CompletedWorker implements WorkerAdapter {
  readonly name = "completed";
  async execute(task: Task, context: WorkerExecutionContext): Promise<WorkerResult> {
    const now = new Date().toISOString();
    return {
      runId: context.runId,
      taskId: task.taskId,
      status: "completed",
      summary: "completed",
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

const task: Task = {
  taskId: "TASK-1",
  projectId: "demo",
  objective: "demo",
  instructions: ["work"],
  acceptanceCriteria: ["done"],
  execution: { workingDirectory: "." }
};

describe("review identity", () => {
  it("blocks a schema-valid review for another task/run", async () => {
    const root = await mkdtemp(join(tmpdir(), "asr-review-identity-"));
    const supervisor = new MockSupervisorAdapter([
      {
        taskId: "OTHER-TASK",
        runId: "OTHER-RUN",
        decision: "PASS",
        summary: "wrong review",
        findings: []
      }
    ]);
    const orchestrator = new Orchestrator({
      worker: new CompletedWorker(),
      supervisor,
      store: new FileStateStore(root),
      runId: () => "RUN-1"
    });

    const record = await orchestrator.run(task);
    expect(record.state).toBe("BLOCKED");
    expect(record.blockedReason).toBe("SUPERVISOR_RESPONSE_INVALID");
  });
});
