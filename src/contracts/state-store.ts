import type { OrchestratorEvent, TaskRecord } from "./state.js";
import type { Task } from "./task.js";
import type { WorkerResult } from "./result.js";
import type { Review } from "./review.js";

export interface StateStore {
  initialize(projectId: string): Promise<void>;
  saveTask(task: Task): Promise<void>;
  loadTask(taskId: string): Promise<Task | undefined>;
  saveRecord(record: TaskRecord): Promise<void>;
  loadRecord(taskId: string): Promise<TaskRecord | undefined>;
  getRunDirectory(runId: string): Promise<string>;
  saveWorkerPrompt(runId: string, prompt: string): Promise<void>;
  loadWorkerPrompt(runId: string): Promise<string | undefined>;
  saveWorkerResult(runId: string, result: WorkerResult): Promise<void>;
  loadWorkerResult(runId: string): Promise<WorkerResult | undefined>;
  saveReview(runId: string, review: Review): Promise<void>;
  loadReview(runId: string): Promise<Review | undefined>;
  appendEvent(runId: string, event: OrchestratorEvent): Promise<void>;
}
