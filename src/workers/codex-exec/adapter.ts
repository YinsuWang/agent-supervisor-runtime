import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Task } from "../../contracts/task.js";
import type { VerificationResult, WorkerResult } from "../../contracts/result.js";
import type { WorkerAdapter, WorkerExecutionContext } from "../../contracts/worker.js";
import { collectGitEvidence } from "./evidence.js";
import { runProcess, type ProcessResult } from "./process.js";

export type CodexExecWorkerOptions = {
  command?: string;
  argsPrefix?: string[];
  defaultTimeoutSeconds?: number;
  verificationCommands?: string[];
  buildArgs?: (prompt: string) => string[];
};

export class CodexExecWorker implements WorkerAdapter {
  readonly name = "codex-exec";
  private readonly controllers = new Map<string, AbortController>();

  constructor(private readonly options: CodexExecWorkerOptions = {}) {}

  async execute(task: Task, context: WorkerExecutionContext): Promise<WorkerResult> {
    await mkdir(context.runDirectory, { recursive: true });
    const startedAt = new Date().toISOString();
    const stdoutPath = join(context.runDirectory, "stdout.log");
    const stderrPath = join(context.runDirectory, "stderr.log");
    const diffPath = join(context.runDirectory, "diff.patch");
    const controller = new AbortController();
    this.controllers.set(context.runId, controller);

    let processResult: ProcessResult;
    try {
      const args = this.options.buildArgs
        ? this.options.buildArgs(context.prompt)
        : [...(this.options.argsPrefix ?? ["exec"]), context.prompt];
      processResult = await runProcess({
        command: this.options.command ?? "codex",
        args,
        cwd: task.execution.workingDirectory,
        stdoutPath,
        stderrPath,
        timeoutMs: (task.execution.timeoutSeconds ?? this.options.defaultTimeoutSeconds ?? 7_200) * 1_000
      }, controller.signal);
    } catch (error) {
      this.controllers.delete(context.runId);
      const completedAt = new Date().toISOString();
      return {
        runId: context.runId,
        taskId: task.taskId,
        status: "failed",
        summary: `Worker process failed to start: ${(error as Error).message}`,
        changedFiles: [], commands: [], verification: [], artifacts: [],
        machineEvidence: { processExitCode: null, timedOut: false, stdoutPath, stderrPath },
        warnings: [(error as Error).message],
        startedAt, completedAt
      };
    } finally {
      this.controllers.delete(context.runId);
    }

    const git = await collectGitEvidence(task.execution.workingDirectory, diffPath);
    const verification = await this.runVerification(task, context);
    const stdout = await safeRead(stdoutPath);
    const success = processResult.exitCode === 0 && !processResult.timedOut && verification.every((item) => item.passed);
    const completedAt = new Date().toISOString();

    return {
      runId: context.runId,
      taskId: task.taskId,
      status: success ? "completed" : "failed",
      summary: summarize(stdout, success, processResult),
      changedFiles: git.changedFiles,
      commands: [{ command: `${this.options.command ?? "codex"} ${(this.options.argsPrefix ?? ["exec"]).join(" ")}`.trim(), exitCode: processResult.exitCode, durationMs: processResult.durationMs, stdoutPath, stderrPath }],
      verification,
      artifacts: git.diffPath ? [{ path: git.diffPath, kind: "diff" }] : [],
      git: git.insideWorkTree ? { branch: git.branch, commit: git.commit, diffStat: git.diffStat } : undefined,
      machineEvidence: {
        processExitCode: processResult.exitCode,
        timedOut: processResult.timedOut,
        stdoutPath,
        stderrPath,
        diffPath: git.diffPath,
        gitStatus: git.status,
        diffStat: git.diffStat
      },
      warnings: processResult.timedOut ? ["Worker process timed out"] : undefined,
      startedAt,
      completedAt
    };
  }

  async cancel(runId: string): Promise<void> {
    this.controllers.get(runId)?.abort();
  }

  private async runVerification(task: Task, context: WorkerExecutionContext): Promise<VerificationResult[]> {
    const results: VerificationResult[] = [];
    for (const [index, command] of (this.options.verificationCommands ?? []).entries()) {
      const stdoutPath = join(context.runDirectory, `verify-${index + 1}.stdout.log`);
      const stderrPath = join(context.runDirectory, `verify-${index + 1}.stderr.log`);
      const shellCommand = process.platform === "win32"
        ? { command: "pwsh", args: ["-NoProfile", "-Command", command] }
        : { command: "/bin/sh", args: ["-lc", command] };
      const result = await runProcess({ ...shellCommand, cwd: task.execution.workingDirectory, stdoutPath, stderrPath, timeoutMs: (task.execution.timeoutSeconds ?? this.options.defaultTimeoutSeconds ?? 7_200) * 1_000 });
      results.push({ command, passed: result.exitCode === 0 && !result.timedOut, exitCode: result.exitCode, durationMs: result.durationMs, stdoutPath, stderrPath });
    }
    return results;
  }
}

async function safeRead(path: string): Promise<string> {
  try { return await readFile(path, "utf8"); } catch { return ""; }
}

function summarize(stdout: string, success: boolean, result: ProcessResult): string {
  const trimmed = stdout.trim();
  if (trimmed) return trimmed.slice(-4_000);
  if (result.timedOut) return "Worker timed out";
  return success ? "Worker completed successfully" : `Worker exited with code ${String(result.exitCode)}`;
}
