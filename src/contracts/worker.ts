import type { Task } from "./task.js";
import type { WorkerResult } from "./result.js";

export type WorkerExecutionContext = {
  runId: string;
  runDirectory: string;
  prompt: string;
  revisionNumber: number;
  retryOrdinal: number;
};

export interface WorkerAdapter {
  readonly name: string;
  execute(task: Task, context: WorkerExecutionContext): Promise<WorkerResult>;
  cancel(runId: string): Promise<void>;
}
