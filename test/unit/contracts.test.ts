import { describe, expect, it } from "vitest";
import { TaskSchema } from "../../src/contracts/task.js";
import { ReviewSchema } from "../../src/contracts/review.js";

describe("runtime contracts", () => {
  it("accepts a valid task", () => {
    const task = TaskSchema.parse({
      taskId: "TASK-1",
      projectId: "demo",
      objective: "Create a file",
      instructions: ["Create hello.txt"],
      acceptanceCriteria: ["hello.txt exists"],
      execution: { workingDirectory: "." }
    });
    expect(task.taskId).toBe("TASK-1");
  });

  it("rejects invalid review decisions", () => {
    expect(() => ReviewSchema.parse({
      taskId: "TASK-1",
      runId: "RUN-1",
      decision: "IGNORE",
      summary: "bad",
      findings: []
    })).toThrow();
  });

  it("requires revision instructions for REVISE", () => {
    expect(() => ReviewSchema.parse({
      taskId: "TASK-1",
      runId: "RUN-1",
      decision: "REVISE",
      summary: "needs work",
      findings: []
    })).toThrow();
  });
});
