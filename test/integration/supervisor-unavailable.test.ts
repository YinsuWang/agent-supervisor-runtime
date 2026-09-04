import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Orchestrator } from "../../src/core/orchestrator.js";
import { SupervisorUnavailableError, type SupervisorAdapter } from "../../src/contracts/supervisor.js";
import type { Task } from "../../src/contracts/task.js";
import type { WorkerAdapter, WorkerExecutionContext } from "../../src/contracts/worker.js";
import type { WorkerResult } from "../../src/contracts/result.js";
import { FileStateStore } from "../../src/stores/file/store.js";

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

class SuccessfulWorker implements WorkerAdapter {
  readonly name = "successful";
  async execute(task: Task, context: WorkerExecutionContext): Promise<WorkerResult> {
    return {
      runId: context.runId,
      taskId: task.taskId,
      status: "completed",
      summary: "done",
      changedFiles: [],
      commands: [],
      verification: [],
      artifacts: [],
      machineEvidence: { processExitCode: 0, timedOut: false },
      startedAt: "2026-09-03T00:00:00.000Z",
      completedAt: "2026-09-03T00:00:01.000Z",
    };
  }
  async cancel(_runId: string): Promise<void> {}
}

class OfflineSupervisor implements SupervisorAdapter {
  readonly name = "offline";
  async requestReview(): Promise<unknown> {
    throw new SupervisorUnavailableError("offline");
  }
}

describe("supervisor connectivity", () => {
  it("preserves REVIEWING instead of blocking when the supervisor transport is unavailable", async () => {
    const directory = await mkdtemp(join(tmpdir(), "asr-supervisor-unavailable-"));
    tempDirs.push(directory);
    const store = new FileStateStore(directory);
    const orchestrator = new Orchestrator({
      worker: new SuccessfulWorker(),
      supervisor: new OfflineSupervisor(),
      store,
      runId: () => "run_1",
      now: () => new Date("2026-09-03T00:00:00.000Z"),
    });

    const task: Task = {
      taskId: "task_1",
      projectId: "project_1",
      objective: "test",
      instructions: ["do it"],
      acceptanceCriteria: ["done"],
      execution: { workingDirectory: "." },
    };

    await expect(orchestrator.run(task)).rejects.toBeInstanceOf(SupervisorUnavailableError);
    expect((await store.loadRecord("task_1"))?.state).toBe("REVIEWING");
  });
});
