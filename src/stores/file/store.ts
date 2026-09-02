import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { StateStore } from "../../contracts/state-store.js";
import { TaskSchema, type Task } from "../../contracts/task.js";
import { TaskRecordSchema, type OrchestratorEvent, type TaskRecord } from "../../contracts/state.js";
import { WorkerResultSchema, type WorkerResult } from "../../contracts/result.js";
import { ReviewSchema, type Review } from "../../contracts/review.js";
import { readJson, writeJsonAtomic } from "../../utils/json.js";

type StateFile = { tasks: Record<string, TaskRecord> };

export class FileStateStore implements StateStore {
  readonly root: string;

  constructor(directory = ".orchestrator") {
    this.root = resolve(directory);
  }

  async initialize(projectId: string): Promise<void> {
    await mkdir(join(this.root, "tasks"), { recursive: true });
    await mkdir(join(this.root, "runs"), { recursive: true });
    await writeIfMissing(join(this.root, "project.json"), { projectId, version: 1 });
    await writeIfMissing(join(this.root, "state.json"), { tasks: {} });
  }

  async saveTask(task: Task): Promise<void> {
    await writeJsonAtomic(join(this.root, "tasks", `${task.taskId}.json`), TaskSchema.parse(task));
  }

  async loadTask(taskId: string): Promise<Task | undefined> {
    const value = await readJson<unknown>(join(this.root, "tasks", `${taskId}.json`));
    return value === undefined ? undefined : TaskSchema.parse(value);
  }

  async saveRecord(record: TaskRecord): Promise<void> {
    const parsed = TaskRecordSchema.parse(record);
    const state = (await readJson<StateFile>(join(this.root, "state.json"))) ?? { tasks: {} };
    state.tasks[record.taskId] = parsed;
    await writeJsonAtomic(join(this.root, "state.json"), state);
  }

  async loadRecord(taskId: string): Promise<TaskRecord | undefined> {
    const state = await readJson<StateFile>(join(this.root, "state.json"));
    const record = state?.tasks[taskId];
    return record ? TaskRecordSchema.parse(record) : undefined;
  }

  async getRunDirectory(runId: string): Promise<string> {
    const directory = join(this.root, "runs", runId);
    await mkdir(directory, { recursive: true });
    return directory;
  }

  async saveWorkerPrompt(runId: string, prompt: string): Promise<void> {
    const dir = await this.getRunDirectory(runId);
    await writeFile(join(dir, "worker-prompt.md"), prompt, "utf8");
  }

  async loadWorkerPrompt(runId: string): Promise<string | undefined> {
    try {
      return await readFile(join(this.root, "runs", runId, "worker-prompt.md"), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  async saveWorkerResult(runId: string, result: WorkerResult): Promise<void> {
    await writeJsonAtomic(join(this.root, "runs", runId, "worker-result.json"), WorkerResultSchema.parse(result));
  }

  async loadWorkerResult(runId: string): Promise<WorkerResult | undefined> {
    const value = await readJson<unknown>(join(this.root, "runs", runId, "worker-result.json"));
    return value === undefined ? undefined : WorkerResultSchema.parse(value);
  }

  async saveReview(runId: string, review: Review): Promise<void> {
    await writeJsonAtomic(join(this.root, "runs", runId, "review.json"), ReviewSchema.parse(review));
  }

  async loadReview(runId: string): Promise<Review | undefined> {
    const value = await readJson<unknown>(join(this.root, "runs", runId, "review.json"));
    return value === undefined ? undefined : ReviewSchema.parse(value);
  }

  async appendEvent(runId: string, event: OrchestratorEvent): Promise<void> {
    const dir = await this.getRunDirectory(runId);
    await appendFile(join(dir, "events.jsonl"), `${JSON.stringify(event)}\n`, "utf8");
  }
}

async function writeIfMissing(path: string, value: unknown): Promise<void> {
  try {
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
}
