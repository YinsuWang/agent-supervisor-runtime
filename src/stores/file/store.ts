import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { StateStore } from "../../contracts/state-store.js";
import { TaskSchema, type Task } from "../../contracts/task.js";
import { TaskRecordSchema, type OrchestratorEvent, type TaskRecord } from "../../contracts/state.js";
import { WorkerResultSchema, type WorkerResult } from "../../contracts/result.js";
import { ReviewSchema, type Review } from "../../contracts/review.js";
import { MessageLedgerEntrySchema, type MessageLedgerEntry } from "../../conversations/message-ledger.js";
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
    await mkdir(join(this.root, "messages"), { recursive: true });
    await writeIfMissing(join(this.root, "project.json"), { projectId, version: 1 });
    await writeIfMissing(join(this.root, "state.json"), { tasks: {} });
  }

  async saveTask(task: Task): Promise<void> {
    assertSafeStateIdentifier(task.taskId);
    await writeJsonAtomic(join(this.root, "tasks", `${task.taskId}.json`), TaskSchema.parse(task));
  }

  async loadTask(taskId: string): Promise<Task | undefined> {
    assertSafeStateIdentifier(taskId);
    const value = await readJson<unknown>(join(this.root, "tasks", `${taskId}.json`));
    return value === undefined ? undefined : TaskSchema.parse(value);
  }

  async saveRecord(record: TaskRecord): Promise<void> {
    assertSafeStateIdentifier(record.taskId);
    const parsed = TaskRecordSchema.parse(record);
    const state = (await readJson<StateFile>(join(this.root, "state.json"))) ?? { tasks: {} };
    state.tasks[record.taskId] = parsed;
    await writeJsonAtomic(join(this.root, "state.json"), state);
  }

  async loadRecord(taskId: string): Promise<TaskRecord | undefined> {
    assertSafeStateIdentifier(taskId);
    const state = await readJson<StateFile>(join(this.root, "state.json"));
    const record = state?.tasks[taskId];
    return record ? TaskRecordSchema.parse(record) : undefined;
  }

  async getRunDirectory(runId: string): Promise<string> {
    assertSafeStateIdentifier(runId);
    const directory = join(this.root, "runs", runId);
    await mkdir(directory, { recursive: true });
    return directory;
  }

  async saveWorkerPrompt(runId: string, prompt: string): Promise<void> {
    const dir = await this.getRunDirectory(runId);
    await writeFile(join(dir, "worker-prompt.md"), prompt, "utf8");
  }

  async loadWorkerPrompt(runId: string): Promise<string | undefined> {
    assertSafeStateIdentifier(runId);
    try {
      return await readFile(join(this.root, "runs", runId, "worker-prompt.md"), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  async saveWorkerResult(runId: string, result: WorkerResult): Promise<void> {
    assertSafeStateIdentifier(runId);
    await writeJsonAtomic(join(this.root, "runs", runId, "worker-result.json"), WorkerResultSchema.parse(result));
  }

  async loadWorkerResult(runId: string): Promise<WorkerResult | undefined> {
    assertSafeStateIdentifier(runId);
    const value = await readJson<unknown>(join(this.root, "runs", runId, "worker-result.json"));
    return value === undefined ? undefined : WorkerResultSchema.parse(value);
  }

  async saveReview(runId: string, review: Review): Promise<void> {
    assertSafeStateIdentifier(runId);
    await writeJsonAtomic(join(this.root, "runs", runId, "review.json"), ReviewSchema.parse(review));
  }

  async loadReview(runId: string): Promise<Review | undefined> {
    assertSafeStateIdentifier(runId);
    const value = await readJson<unknown>(join(this.root, "runs", runId, "review.json"));
    return value === undefined ? undefined : ReviewSchema.parse(value);
  }

  async appendEvent(runId: string, event: OrchestratorEvent): Promise<void> {
    const dir = await this.getRunDirectory(runId);
    await appendFile(join(dir, "events.jsonl"), `${JSON.stringify(event)}\n`, "utf8");
  }

  async saveMessageRecord(record: MessageLedgerEntry): Promise<void> {
    assertSafeStateIdentifier(record.messageId);
    await mkdir(join(this.root, "messages"), { recursive: true });
    await writeJsonAtomic(
      join(this.root, "messages", `${record.messageId}.json`),
      MessageLedgerEntrySchema.parse(record),
    );
  }

  async loadMessageRecord(messageId: string): Promise<MessageLedgerEntry | undefined> {
    assertSafeStateIdentifier(messageId);
    const value = await readJson<unknown>(join(this.root, "messages", `${messageId}.json`));
    return value === undefined ? undefined : MessageLedgerEntrySchema.parse(value);
  }

  async listMessageRecords(): Promise<MessageLedgerEntry[]> {
    let names: string[];
    try {
      names = await readdir(join(this.root, "messages"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }

    const records: MessageLedgerEntry[] = [];
    for (const name of names.filter((value) => value.endsWith(".json")).sort()) {
      const messageId = name.slice(0, -".json".length);
      assertSafeStateIdentifier(messageId);
      const record = await this.loadMessageRecord(messageId);
      if (record) records.push(record);
    }
    return records;
  }
}

function assertSafeStateIdentifier(value: string): void {
  if (
    value.length === 0 ||
    value === "." ||
    value === ".." ||
    value.includes("/") ||
    value.includes("\\") ||
    value.includes(":") ||
    value.includes("\0")
  ) {
    throw new Error(`Unsafe state identifier: ${JSON.stringify(value)}`);
  }
}

async function writeIfMissing(path: string, value: unknown): Promise<void> {
  try {
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
}
