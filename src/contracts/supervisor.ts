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

export class SupervisorUnavailableError extends Error {
  readonly code = "SUPERVISOR_UNAVAILABLE";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SupervisorUnavailableError";
  }
}

export interface SupervisorAdapter {
  readonly name: string;
  requestReview(input: ReviewRequest): Promise<unknown>;
  notify?(input: SupervisorNotification): Promise<void>;
}
