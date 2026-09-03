import { describe, expect, it } from "vitest";
import type { Task } from "../../src/contracts/task.js";
import type { WorkerResult } from "../../src/contracts/result.js";
import type { ContextManifest } from "../../src/context/contracts.js";
import { compileReviewPacket } from "../../src/chatgpt/review-packet.js";

const task: Task = {
  taskId: "task_1",
  projectId: "project_1",
  objective: "Implement compact review packets",
  instructions: ["Keep evidence on demand"],
  acceptanceCriteria: ["No full diff in default packet"],
  execution: { workingDirectory: "." },
};

const result: WorkerResult = {
  runId: "run_1",
  taskId: "task_1",
  status: "completed",
  summary: "Implemented the change",
  changedFiles: ["src/example.ts"],
  commands: [{ command: "npm test", exitCode: 0, durationMs: 10, stdoutPath: "FULL_LOG_SECRET" }],
  verification: [{ command: "npm test", passed: true, exitCode: 0, durationMs: 10, stdoutPath: "FULL_TEST_LOG_SECRET" }],
  artifacts: [],
  machineEvidence: { processExitCode: 0, timedOut: false, diffPath: "FULL_DIFF_SECRET" },
  startedAt: "2026-09-03T00:00:00.000Z",
  completedAt: "2026-09-03T00:01:00.000Z",
};

const manifest: ContextManifest = {
  bindingId: "bind_1",
  taskId: "task_1",
  runId: "run_1",
  available: [{ ref: "ctx_diff", capability: "git_diff", summary: "1 file changed", size: 12000 }],
};

describe("compileReviewPacket", () => {
  it("contains compact summaries and manifest metadata but not full evidence paths/content", () => {
    const packet = compileReviewPacket(task, result, manifest);
    const serialized = JSON.stringify(packet);

    expect(packet.worker.summary).toBe("Implemented the change");
    expect(packet.changedFiles).toEqual({ count: 1, paths: ["src/example.ts"] });
    expect(packet.tests).toMatchObject({ total: 1, passed: 1, failed: 0 });
    expect(packet.evidence[0]).toMatchObject({ ref: "ctx_diff", summary: "1 file changed", size: 12000 });
    expect(serialized).not.toContain("FULL_DIFF_SECRET");
    expect(serialized).not.toContain("FULL_LOG_SECRET");
    expect(serialized).not.toContain("FULL_TEST_LOG_SECRET");
  });

  it("fails closed when the compact packet exceeds its explicit budget", () => {
    expect(() => compileReviewPacket(task, result, manifest, 10)).toThrow("REVIEW_PACKET_TOO_LARGE");
  });
});
