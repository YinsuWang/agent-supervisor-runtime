import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { spawn } from "node:child_process";

export type ProcessSpec = {
  command: string;
  args: string[];
  cwd: string;
  stdoutPath: string;
  stderrPath: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  shell?: boolean;
};

export type ProcessResult = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  durationMs: number;
  stdoutPath: string;
  stderrPath: string;
};

export async function runProcess(spec: ProcessSpec, signal?: AbortSignal): Promise<ProcessResult> {
  await mkdir(dirname(spec.stdoutPath), { recursive: true });
  await mkdir(dirname(spec.stderrPath), { recursive: true });

  return await new Promise<ProcessResult>((resolve, reject) => {
    const started = Date.now();
    const stdout = createWriteStream(spec.stdoutPath, { encoding: "utf8" });
    const stderr = createWriteStream(spec.stderrPath, { encoding: "utf8" });
    let timedOut = false;
    let settled = false;

    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: spec.env ?? process.env,
      shell: spec.shell ?? false,
      windowsHide: true
    });

    child.stdout?.pipe(stdout);
    child.stderr?.pipe(stderr);

    const timer = spec.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill();
        }, spec.timeoutMs)
      : undefined;

    const abort = () => child.kill();
    signal?.addEventListener("abort", abort, { once: true });

    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      stdout.end();
      stderr.end();
      reject(error);
    });

    child.once("close", (exitCode, childSignal) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      stdout.end();
      stderr.end();
      resolve({
        exitCode,
        signal: childSignal,
        timedOut,
        durationMs: Date.now() - started,
        stdoutPath: spec.stdoutPath,
        stderrPath: spec.stderrPath
      });
    });
  });
}
