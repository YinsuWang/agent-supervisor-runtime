import type { Task } from "./task.js";
import type { WorkerResult } from "./result.js";
import type { Review } from "./review.js";

export type ReviewRequest = {
  task: Task;
  result: WorkerResult;
  previousReview?: Review;
  revisionNumber: number;
};

export type SupervisorNotification = {
  type: "status" | "blocked" | "completed";
  taskId: string;
  message: string;
};

export interface SupervisorAdapter {
  readonly name: string;
  requestReview(input: ReviewRequest): Promise<unknown>;
  notify?(input: SupervisorNotification): Promise<void>;
}
