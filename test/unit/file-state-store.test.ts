import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileStateStore } from "../../src/stores/file/store.js";
import type { Task } from "../../src/contracts/task.js";

const task: Task = {
  taskId: "TASK-1",
  projectId: "demo",
  objective: "Persist state",
  instructions: ["Save it"],
  acceptanceCriteria: ["It reloads"],
  execution: { workingDirectory: "." }
};

describe("FileStateStore", () => {
  it("persists tasks and state across instances", async () => {
    const root = await mkdtemp(join(tmpdir(), "asr-store-"));
    const store = new FileStateStore(root);
    await store.initialize("demo");
    await store.saveTask(task);
    await store.saveRecord({ taskId: task.taskId, projectId: task.projectId, state: "READY", revisionCount: 0, retryCount: 0, updatedAt: new Date().toISOString() });

    const reopened = new FileStateStore(root);
    expect((await reopened.loadTask("TASK-1"))?.objective).toBe("Persist state");
    expect((await reopened.loadRecord("TASK-1"))?.state).toBe("READY");
  });

  it("appends ordered JSONL events", async () => {
    const root = await mkdtemp(join(tmpdir(), "asr-events-"));
    const store = new FileStateStore(root);
    await store.initialize("demo");
    const timestamp = new Date().toISOString();
    await store.appendEvent("RUN-1", { event: "worker.started", timestamp, taskId: "TASK-1", runId: "RUN-1" });
    await store.appendEvent("RUN-1", { event: "worker.completed", timestamp, taskId: "TASK-1", runId: "RUN-1" });
    const lines = (await readFile(join(root, "runs", "RUN-1", "events.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
    expect(lines.map((line) => line.event)).toEqual(["worker.started", "worker.completed"]);
  });
});
