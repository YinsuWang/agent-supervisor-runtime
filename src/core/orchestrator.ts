import { randomUUID } from "node:crypto";
import type { StateStore } from "../contracts/state-store.js";
import { SupervisorUnavailableError, type SupervisorAdapter } from "../contracts/supervisor.js";
import type { Task } from "../contracts/task.js";
import type { TaskRecord } from "../contracts/state.js";
import type { WorkerAdapter } from "../contracts/worker.js";
import type { Review } from "../contracts/review.js";
import type { WorkerResult } from "../contracts/result.js";
import { PolicyEngine } from "./policy-engine.js";
import { transition, type StateEvent } from "./state-machine.js";
import { compileRevisionPrompt, compileWorkerPrompt } from "../workers/prompt-compiler.js";

const TERMINAL = new Set(["COMPLETED", "BLOCKED", "FAILED"]);

export type OrchestratorDependencies = {
  worker: WorkerAdapter;
  supervisor: SupervisorAdapter;
  store: StateStore;
  policy?: PolicyEngine;
  now?: () => Date;
  runId?: () => string;
};

export class Orchestrator {
  private readonly policy: PolicyEngine;
  private readonly now: () => Date;
  private readonly runId: () => string;

  constructor(private readonly deps: OrchestratorDependencies) {
    this.policy = deps.policy ?? new PolicyEngine();
    this.now = deps.now ?? (() => new Date());
    this.runId = deps.runId ?? (() => randomUUID());
  }

  async run(input: unknown): Promise<TaskRecord> {
    const task = this.policy.validateTask(input);
    await this.deps.store.initialize(task.projectId);
    await this.deps.store.saveTask(task);
    const now = this.isoNow();
    let record: TaskRecord = {
      taskId: task.taskId,
      projectId: task.projectId,
      state: "CREATED",
      revisionCount: 0,
      retryCount: 0,
      runCount: 0,
      startedAt: now,
      updatedAt: now
    };
    await this.deps.store.saveRecord(record);
    record = await this.move(record, "VALIDATE");
    return await this.advance(task, record);
  }

  async resume(taskId: string): Promise<TaskRecord> {
    const task = await this.deps.store.loadTask(taskId);
    const record = await this.deps.store.loadRecord(taskId);
    if (!task || !record) throw new Error(`Task ${taskId} is not persisted`);
    if (TERMINAL.has(record.state)) return record;

    if (record.state === "RUNNING") {
      return await this.resumeRunning(task, record);
    }
    return await this.advance(task, record);
  }

  private async advance(task: Task, initial: TaskRecord): Promise<TaskRecord> {
    let record = initial;
    while (!TERMINAL.has(record.state)) {
      const budget = this.policy.checkRuntimeBudget(task, record, this.now());
      if (!budget.allowed) {
        record = await this.block(record, budget.reason);
        break;
      }

      switch (record.state) {
        case "CREATED":
          record = await this.move(record, "VALIDATE");
          break;
        case "READY":
        case "RETRY_READY":
        case "REVISION_READY":
          record = await this.prepareDispatch(task, record);
          break;
        case "DISPATCHED":
          record = await this.executeDispatched(task, record);
          break;
        case "RUNNING":
          record = await this.resumeRunning(task, record);
          break;
        case "RESULT_READY":
          record = await this.move(record, "REQUEST_REVIEW", "review.requested");
          break;
        case "REVIEWING":
          record = await this.reviewCurrent(task, record);
          break;
        default:
          throw new Error(`Unhandled non-terminal state ${record.state}`);
      }
    }
    return record;
  }

  private async prepareDispatch(task: Task, record: TaskRecord): Promise<TaskRecord> {
    const runCount = record.runCount ?? 0;
    if (task.budget?.maxRuns && runCount >= task.budget.maxRuns) {
      return await this.block(record, "RUN_BUDGET_EXCEEDED");
    }

    const previousRunId = record.currentRunId;
    const currentRunId = `${task.taskId}-${this.runId()}`;
    let next: TaskRecord = { ...record, previousRunId, currentRunId, runCount: runCount + 1, updatedAt: this.isoNow() };
    next = await this.move(next, "DISPATCH", "task.dispatched");

    let prompt: string;
    if (record.state === "REVISION_READY" && previousRunId) {
      const previousResult = await this.deps.store.loadWorkerResult(previousRunId);
      const previousReview = await this.deps.store.loadReview(previousRunId);
      if (!previousResult || !previousReview) return await this.block(next, "REVISION_CONTEXT_MISSING");

      const resultIdentity = this.workerResultIdentityError(task, previousRunId, previousResult);
      if (resultIdentity) return await this.block(next, "WORKER_RESULT_INVALID", resultIdentity);
      const reviewIdentity = this.reviewIdentityError(task, previousRunId, previousReview);
      if (reviewIdentity) return await this.block(next, "SUPERVISOR_RESPONSE_INVALID", reviewIdentity);

      prompt = compileRevisionPrompt(task, currentRunId, previousResult, previousReview);
    } else {
      prompt = compileWorkerPrompt(task, currentRunId);
    }
    await this.deps.store.saveWorkerPrompt(currentRunId, prompt);
    return next;
  }

  private async executeDispatched(task: Task, record: TaskRecord): Promise<TaskRecord> {
    const runId = record.currentRunId;
    if (!runId) return await this.block(record, "RUN_ID_MISSING");
    const prompt = await this.deps.store.loadWorkerPrompt(runId);
    if (!prompt) return await this.block(record, "WORKER_PROMPT_MISSING");
    const runDirectory = await this.deps.store.getRunDirectory(runId);

    let running = await this.move(record, "START", "worker.started");
    let result: WorkerResult;
    try {
      result = await this.deps.worker.execute(task, {
        runId,
        runDirectory,
        prompt,
        revisionNumber: running.revisionCount,
        retryOrdinal: running.retryCount
      });
    } catch (error) {
      result = {
        runId,
        taskId: task.taskId,
        status: "failed",
        summary: `Worker adapter threw: ${(error as Error).message}`,
        changedFiles: [], commands: [], verification: [], artifacts: [],
        machineEvidence: { processExitCode: null, timedOut: false },
        warnings: [(error as Error).message],
        startedAt: this.isoNow(), completedAt: this.isoNow()
      };
    }

    const identityError = this.workerResultIdentityError(task, runId, result);
    if (identityError) return await this.block(running, "WORKER_RESULT_INVALID", identityError);

    await this.deps.store.saveWorkerResult(runId, result);
    await this.event(running, "result.persisted", { status: result.status });

    if (result.status === "completed") {
      running = await this.move(running, "WORKER_SUCCEEDED", "worker.completed");
      return running;
    }

    const retry = this.policy.shouldRetryWorker(running.retryCount);
    if (retry.allowed) {
      running = { ...running, retryCount: running.retryCount + 1, updatedAt: this.isoNow() };
      await this.deps.store.saveRecord(running);
      return await this.move(running, "WORKER_RETRY", "worker.retry_scheduled");
    }

    running = { ...running, failedReason: retry.reason, updatedAt: this.isoNow() };
    await this.deps.store.saveRecord(running);
    return await this.move(running, "WORKER_FAILED", "worker.failed");
  }

  private async reviewCurrent(task: Task, record: TaskRecord): Promise<TaskRecord> {
    const runId = record.currentRunId;
    if (!runId) return await this.block(record, "RUN_ID_MISSING");
    const result = await this.deps.store.loadWorkerResult(runId);
    if (!result) return await this.block(record, "WORKER_RESULT_MISSING");

    const resultIdentity = this.workerResultIdentityError(task, runId, result);
    if (resultIdentity) return await this.block(record, "WORKER_RESULT_INVALID", resultIdentity);

    let review = await this.deps.store.loadReview(runId);
    if (!review) {
      const previousReview = record.previousRunId ? await this.deps.store.loadReview(record.previousRunId) : undefined;
      let raw: unknown;
      try {
        raw = await this.deps.supervisor.requestReview({ task, result, previousReview, revisionNumber: record.revisionCount });
        review = this.policy.validateReview(raw);
      } catch (error) {
        if (error instanceof SupervisorUnavailableError) throw error;
        return await this.block(record, "SUPERVISOR_RESPONSE_INVALID", { error: (error as Error).message });
      }
    }

    const reviewIdentity = this.reviewIdentityError(task, runId, review);
    if (reviewIdentity) return await this.block(record, "SUPERVISOR_RESPONSE_INVALID", reviewIdentity);

    if (!(await this.deps.store.loadReview(runId))) {
      await this.deps.store.saveReview(runId, review);
    }

    return await this.applyReview(record, review);
  }

  private async applyReview(record: TaskRecord, review: Review): Promise<TaskRecord> {
    if (review.decision === "PASS") {
      const next = await this.move(record, "REVIEW_PASS", "review.pass");
      await this.deps.supervisor.notify?.({ type: "completed", taskId: record.taskId, message: review.summary });
      return next;
    }

    if (review.decision === "ASK_USER") {
      return await this.block(record, "USER_DECISION_REQUIRED", { question: review.userQuestion });
    }

    const previousReview = record.previousRunId ? await this.deps.store.loadReview(record.previousRunId) : undefined;
    const decision = this.policy.canAutoRevise(record, review, previousReview);
    if (!decision.allowed) return await this.block(record, decision.reason);

    const revised = {
      ...record,
      revisionCount: record.revisionCount + 1,
      retryCount: 0,
      updatedAt: this.isoNow()
    };
    await this.deps.store.saveRecord(revised);
    return await this.move(revised, "REVIEW_REVISE", "review.revise", { revisionCount: revised.revisionCount });
  }

  private async resumeRunning(task: Task, record: TaskRecord): Promise<TaskRecord> {
    const runId = record.currentRunId;
    if (!runId) return await this.block(record, "RUN_ID_MISSING");
    const result = await this.deps.store.loadWorkerResult(runId);
    if (result) {
      const identityError = this.workerResultIdentityError(task, runId, result);
      if (identityError) return await this.block(record, "WORKER_RESULT_INVALID", identityError);

      const normalized = result.status === "completed"
        ? await this.move(record, "WORKER_SUCCEEDED", "worker.completed", { recovered: true })
        : await this.recoverInterruptedFailure(record);
      return await this.advance(task, normalized);
    }
    const retry = await this.recoverInterruptedFailure(record);
    return await this.advance(task, retry);
  }

  private workerResultIdentityError(task: Task, expectedRunId: string, result: WorkerResult): Record<string, unknown> | undefined {
    if (result.taskId === task.taskId && result.runId === expectedRunId) return undefined;
    return {
      expectedTaskId: task.taskId,
      receivedTaskId: result.taskId,
      expectedRunId,
      receivedRunId: result.runId
    };
  }

  private reviewIdentityError(task: Task, expectedRunId: string, review: Review): Record<string, unknown> | undefined {
    if (review.taskId === task.taskId && review.runId === expectedRunId) return undefined;
    return {
      expectedTaskId: task.taskId,
      receivedTaskId: review.taskId,
      expectedRunId,
      receivedRunId: review.runId
    };
  }

  private async recoverInterruptedFailure(record: TaskRecord): Promise<TaskRecord> {
    const retry = this.policy.shouldRetryWorker(record.retryCount);
    if (retry.allowed) {
      const bumped = { ...record, retryCount: record.retryCount + 1, updatedAt: this.isoNow() };
      await this.deps.store.saveRecord(bumped);
      return await this.move(bumped, "WORKER_RETRY", "worker.retry_scheduled", { recovered: true });
    }
    const failed = { ...record, failedReason: retry.reason, updatedAt: this.isoNow() };
    await this.deps.store.saveRecord(failed);
    return await this.move(failed, "WORKER_FAILED", "worker.failed", { recovered: true });
  }

  private async block(record: TaskRecord, reason: string, data?: Record<string, unknown>): Promise<TaskRecord> {
    const blocked = { ...record, blockedReason: reason, updatedAt: this.isoNow() };
    await this.deps.store.saveRecord(blocked);
    const next = await this.move(blocked, "BLOCK", "task.blocked", { reason, ...data });
    await this.deps.supervisor.notify?.({ type: "blocked", taskId: record.taskId, message: reason });
    return next;
  }

  private async move(record: TaskRecord, event: StateEvent, eventName?: string, data?: Record<string, unknown>): Promise<TaskRecord> {
    const next = { ...record, state: transition(record.state, event), updatedAt: this.isoNow() };
    await this.deps.store.saveRecord(next);
    if (eventName && next.currentRunId) await this.event(next, eventName, data);
    return next;
  }

  private async event(record: TaskRecord, event: string, data?: Record<string, unknown>): Promise<void> {
    if (!record.currentRunId) return;
    await this.deps.store.appendEvent(record.currentRunId, {
      event,
      timestamp: this.isoNow(),
      taskId: record.taskId,
      runId: record.currentRunId,
      data
    });
  }

  private isoNow(): string {
    return this.now().toISOString();
  }
}
