import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CodexExecWorker } from "../../src/workers/codex-exec/adapter.js";

const exec = promisify(execFile);

describe("CodexExecWorker", () => {
  it("collects machine-observed git evidence", async () => {
    const repo = await mkdtemp(join(tmpdir(), "asr-worker-repo-"));
    await exec("git", ["init"], { cwd: repo });
    await exec("git", ["config", "user.email", "test@example.com"], { cwd: repo });
    await exec("git", ["config", "user.name", "Test"], { cwd: repo });
    await writeFile(join(repo, "tracked.txt"), "before\n");
    await exec("git", ["add", "."], { cwd: repo });
    await exec("git", ["commit", "-m", "base"], { cwd: repo });

    const script = join(repo, "worker.mjs");
    await writeFile(script, "import {writeFile} from 'node:fs/promises'; await writeFile('tracked.txt','after\\n'); console.log('done');\n");
    const runDir = join(repo, ".runtime-run");
    const worker = new CodexExecWorker({ command: process.execPath, buildArgs: () => [script] });
    const result = await worker.execute({ taskId: "TASK-1", projectId: "demo", objective: "edit", instructions: ["edit"], acceptanceCriteria: ["changed"], execution: { workingDirectory: repo } }, { runId: "RUN-1", runDirectory: runDir, prompt: "edit", revisionNumber: 0, retryOrdinal: 0 });

    expect(result.status).toBe("completed");
    expect(result.changedFiles).toContain("tracked.txt");
    expect(result.machineEvidence.processExitCode).toBe(0);
    expect(result.git?.diffStat).toContain("tracked.txt");
  });
});
