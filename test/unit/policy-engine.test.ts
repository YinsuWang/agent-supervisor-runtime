import { describe, expect, it } from "vitest";
import { PolicyEngine } from "../../src/core/policy-engine.js";
import type { TaskRecord } from "../../src/contracts/state.js";
import type { Review } from "../../src/contracts/review.js";

const record = (revisionCount = 0, retryCount = 0): TaskRecord => ({
  taskId: "TASK-1",
  projectId: "demo",
  state: "REVIEWING",
  revisionCount,
  retryCount,
  updatedAt: new Date().toISOString()
});

const revise = (fingerprint = "test:missing"): Review => ({
  taskId: "TASK-1",
  runId: "RUN-1",
  decision: "REVISE",
  summary: "revise",
  findings: [{ severity: "major", category: "test", message: "missing", fingerprint }],
  revisionInstructions: ["Fix the missing test"]
});

describe("PolicyEngine", () => {
  it("allows revisions below the limit and blocks at the limit", () => {
    const policy = new PolicyEngine({ maxRevisions: 3, maxWorkerRetries: 2 });
    expect(policy.canAutoRevise(record(2), revise()).allowed).toBe(true);
    expect(policy.canAutoRevise(record(3), revise())).toEqual({ allowed: false, reason: "REVISION_LIMIT_EXCEEDED" });
  });

  it("keeps worker retry budget separate", () => {
    const policy = new PolicyEngine({ maxRevisions: 3, maxWorkerRetries: 2 });
    expect(policy.shouldRetryWorker(1).allowed).toBe(true);
    expect(policy.shouldRetryWorker(2)).toEqual({ allowed: false, reason: "WORKER_RETRY_LIMIT_EXCEEDED" });
  });

  it("blocks a repeated unresolved finding", () => {
    const policy = new PolicyEngine();
    expect(policy.canAutoRevise(record(), revise(), revise())).toEqual({ allowed: false, reason: "REPEATED_UNRESOLVED_FINDING" });
  });

  it("forces user decisions for protected findings", () => {
    const policy = new PolicyEngine();
    const review = revise();
    review.findings[0]!.requiresUserDecision = true;
    expect(policy.canAutoRevise(record(), review)).toEqual({ allowed: false, reason: "USER_DECISION_REQUIRED" });
  });
});
