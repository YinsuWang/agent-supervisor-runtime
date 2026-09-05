import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runProcess } from "../../src/workers/codex-exec/process.js";

describe("runProcess", () => {
  it("captures exit status and duration", async () => {
    const dir = await mkdtemp(join(tmpdir(), "asr-proc-"));
    const result = await runProcess({ command: process.execPath, args: ["-e", "console.log('ok')"], cwd: dir, stdoutPath: join(dir, "out"), stderrPath: join(dir, "err") });
    expect(result.exitCode).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("marks timed out processes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "asr-timeout-"));
    const result = await runProcess({ command: process.execPath, args: ["-e", "setTimeout(()=>{}, 10000)"], cwd: dir, stdoutPath: join(dir, "out"), stderrPath: join(dir, "err"), timeoutMs: 20 });
    expect(result.timedOut).toBe(true);
  });

  it("closes stdin for non-interactive workers", async () => {
    const dir = await mkdtemp(join(tmpdir(), "asr-stdin-"));
    const result = await runProcess({
      command: process.execPath,
      args: ["-e", "process.stdin.resume(); process.stdin.on('end',()=>console.log('stdin-closed'))"],
      cwd: dir,
      stdoutPath: join(dir, "out"),
      stderrPath: join(dir, "err"),
      timeoutMs: 1_000,
    });
    expect(result.exitCode).toBe(0);
    expect(await readFile(result.stdoutPath, "utf8")).toContain("stdin-closed");
  });
});
