import type { Task } from "../contracts/task.js";
import type { WorkerResult } from "../contracts/result.js";
import type { Review } from "../contracts/review.js";

export function compileWorkerPrompt(task: Task, runId: string): string {
  return [
    "# Worker Task",
    "",
    `Task ID: ${task.taskId}`,
    `Run ID: ${runId}`,
    "",
    "## Objective",
    task.objective,
    task.context ? `\n## Context\n${task.context}` : "",
    "",
    "## Required Work",
    ...task.instructions.map((item, index) => `${index + 1}. ${item}`),
    "",
    "## Constraints",
    ...(task.constraints?.map((item) => `- ${item}`) ?? ["- Follow repository safety and task boundaries."]),
    "",
    "## Acceptance Criteria",
    ...task.acceptanceCriteria.map((item) => `- ${item}`),
    "",
    "## Repository Rules",
    "Read AGENTS.md and any applicable repository instructions before modifying files.",
    "",
    "## Reporting Requirements",
    "Report a concise summary, changed files, commands/tests run, verification results, warnings, and unresolved issues."
  ].filter(Boolean).join("\n");
}

export function compileRevisionPrompt(task: Task, runId: string, previousResult: WorkerResult, review: Review): string {
  return [
    compileWorkerPrompt(task, runId),
    "",
    "## Revision Context",
    `Previous result: ${previousResult.summary}`,
    `Supervisor review: ${review.summary}`,
    "",
    "## Required Revision",
    ...(review.revisionInstructions ?? []).map((item, index) => `${index + 1}. ${item}`),
    "",
    "Do not broaden the task objective. Preserve already-correct work unless a revision instruction requires changing it."
  ].join("\n");
}
