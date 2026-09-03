import type { SupervisorAdapter, ReviewRequest, SupervisorNotification } from "../../contracts/supervisor.js";

export class MockSupervisorAdapter implements SupervisorAdapter {
  readonly name = "mock";
  readonly notifications: SupervisorNotification[] = [];
  private readonly scripted: unknown[];

  constructor(scripted: unknown[]) {
    this.scripted = [...scripted];
  }

  async requestReview(_input: ReviewRequest): Promise<unknown> {
    if (this.scripted.length === 0) throw new Error("Mock supervisor script exhausted");
    const value = this.scripted.shift();
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const candidate = value as Record<string, unknown>;
      return { ...candidate, taskId: candidate.taskId ?? _input.task.taskId, runId: candidate.runId ?? _input.result.runId };
    }
    return value;
  }

  async notify(input: SupervisorNotification): Promise<void> {
    this.notifications.push(input);
  }
}
