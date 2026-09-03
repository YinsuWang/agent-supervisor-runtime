import { describe, expect, it } from "vitest";
import { compileRevisionPrompt, compileWorkerPrompt } from "../../src/workers/prompt-compiler.js";
import type { Task } from "../../src/contracts/task.js";

const task: Task = {
  taskId: "TASK-1",
  projectId: "demo",
  objective: "Implement feature",
  instructions: ["Change code"],
  constraints: ["Do not alter raw data"],
  acceptanceCriteria: ["Tests pass"],
  execution: { workingDirectory: "." }
};

describe("worker prompt compiler", () => {
  it("packages a self-contained task", () => {
    const prompt = compileWorkerPrompt(task, "RUN-1");
    expect(prompt).toContain("Task ID: TASK-1");
    expect(prompt).toContain("AGENTS.md");
    expect(prompt).toContain("Tests pass");
  });

  it("adds review context for revisions", () => {
    const prompt = compileRevisionPrompt(task, "RUN-2", {
      runId: "RUN-1", taskId: "TASK-1", status: "completed", summary: "first pass", changedFiles: [], commands: [], verification: [], artifacts: [], machineEvidence: { processExitCode: 0, timedOut: false }, startedAt: new Date().toISOString(), completedAt: new Date().toISOString()
    }, {
      taskId: "TASK-1", runId: "RUN-1", decision: "REVISE", summary: "missing check", findings: [], revisionInstructions: ["Add the missing check"]
    });
    expect(prompt).toContain("first pass");
    expect(prompt).toContain("Add the missing check");
  });
});
