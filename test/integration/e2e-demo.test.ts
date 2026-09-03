import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Orchestrator } from "../../src/core/orchestrator.js";
import { FileStateStore } from "../../src/stores/file/store.js";
import { MockSupervisorAdapter } from "../../src/supervisors/mock/adapter.js";
import { CodexExecWorker } from "../../src/workers/codex-exec/adapter.js";

describe("end-to-end mock review loop", () => {
  it("executes, revises, and completes through public adapters", async () => {
    const root = await mkdtemp(join(tmpdir(), "asr-e2e-"));
    const workerScript = join(root, "worker.mjs");
    await writeFile(workerScript, "console.log('fake complete');\n");
    const store = new FileStateStore(join(root, ".orchestrator"));
    const worker = new CodexExecWorker({ command: process.execPath, buildArgs: () => [workerScript] });
    const supervisor = new MockSupervisorAdapter([
      { decision: "REVISE", summary: "exercise revision", findings: [{ severity: "minor", category: "demo", message: "revise", fingerprint: "demo:revise" }], revisionInstructions: ["repeat once"] },
      { decision: "PASS", summary: "approved", findings: [] }
    ]);
    let n = 0;
    const runtime = new Orchestrator({ worker, supervisor, store, runId: () => `RUN-${++n}` });
    const record = await runtime.run({ taskId: "DEMO", projectId: "demo", objective: "demo", instructions: ["run"], acceptanceCriteria: ["pass"], execution: { workingDirectory: root } });
    expect(record.state).toBe("COMPLETED");
    expect(record.revisionCount).toBe(1);
    expect(record.runCount).toBe(2);
  });
});
