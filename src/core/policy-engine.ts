import { ReviewSchema, type Review } from "../contracts/review.js";
import { TaskSchema, type Task } from "../contracts/task.js";
import type { TaskRecord } from "../contracts/state.js";

export type PolicyConfig = {
  maxRevisions: number;
  maxWorkerRetries: number;
  maxWallClockMinutes?: number;
};

export type PolicyDecision = { allowed: true } | { allowed: false; reason: string };

export class PolicyEngine {
  constructor(readonly config: PolicyConfig = { maxRevisions: 3, maxWorkerRetries: 2 }) {}

  validateTask(input: unknown): Task {
    return TaskSchema.parse(input);
  }

  validateReview(input: unknown): Review {
    return ReviewSchema.parse(input);
  }

  shouldRetryWorker(retryCount: number): PolicyDecision {
    return retryCount < this.config.maxWorkerRetries
      ? { allowed: true }
      : { allowed: false, reason: "WORKER_RETRY_LIMIT_EXCEEDED" };
  }

  checkRuntimeBudget(task: Task, record: TaskRecord, now = new Date()): PolicyDecision {
    const limit = task.budget?.maxWallClockMinutes ?? this.config.maxWallClockMinutes;
    if (!limit || !record.startedAt) return { allowed: true };
    const elapsedMs = now.getTime() - new Date(record.startedAt).getTime();
    return elapsedMs > limit * 60_000
      ? { allowed: false, reason: "WALL_CLOCK_BUDGET_EXCEEDED" }
      : { allowed: true };
  }

  canAutoRevise(record: TaskRecord, review: Review, previousReview?: Review): PolicyDecision {
    if (review.decision !== "REVISE") {
      return { allowed: false, reason: review.decision === "ASK_USER" ? "USER_DECISION_REQUIRED" : "NOT_A_REVISION" };
    }

    if (review.findings.some((finding) => finding.requiresUserDecision)) {
      return { allowed: false, reason: "USER_DECISION_REQUIRED" };
    }

    if (record.revisionCount >= this.config.maxRevisions) {
      return { allowed: false, reason: "REVISION_LIMIT_EXCEEDED" };
    }

    if (previousReview) {
      const prior = new Set(previousReview.findings.map((finding) => finding.fingerprint).filter(Boolean));
      const repeated = review.findings.some((finding) => finding.fingerprint && prior.has(finding.fingerprint));
      if (repeated) return { allowed: false, reason: "REPEATED_UNRESOLVED_FINDING" };
    }

    return { allowed: true };
  }
}
