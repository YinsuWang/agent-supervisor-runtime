import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ContextBroker } from "../../src/context/broker.js";
import { ContextBrokerError } from "../../src/context/contracts.js";
import { RuntimeEvidenceSource, type RuntimeEvidenceProvider } from "../../src/context/sources/runtime-evidence.js";
import type { ContextScope } from "../../src/context/contracts.js";

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function workspace(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "asr-context-"));
  tempDirs.push(directory);
  await mkdir(join(directory, "src"));
  await writeFile(join(directory, "src", "sample.txt"), "alpha\nneedle here\nomega\n", "utf8");
  return directory;
}

function scope(root: string, runId = "run_1"): ContextScope {
  return { bindingId: "bind_1", taskId: "task_1", runId, workspaceRoot: root };
}

class EvidenceProvider implements RuntimeEvidenceProvider {
  async executionSummary(_scope: ContextScope): Promise<string> {
    return "worker completed";
  }
  async testSummary(_scope: ContextScope): Promise<string> {
    return "12 passed, 0 failed";
  }
}

describe("ContextBroker", () => {
  it("creates opaque run-scoped evidence refs and resolves read-only dynamic queries", async () => {
    const root = await workspace();
    let nextId = 0;
    const broker = new ContextBroker({
      id: () => `id_${nextId++}`,
      runtimeEvidence: new RuntimeEvidenceSource(new EvidenceProvider()),
    });
    const manifest = await broker.createManifest(scope(root));

    expect(manifest.available.some((item) => item.capability === "execution_summary")).toBe(true);
    expect(manifest.available.every((item) => item.ref.startsWith("ctx_"))).toBe(true);

    const response = await broker.fetch({
      bindingId: "bind_1",
      taskId: "task_1",
      runId: "run_1",
      query: { capability: "read_file", path: "src/sample.txt" },
    });
    expect(response.content).toContain("needle here");

    const search = await broker.fetch({
      bindingId: "bind_1",
      taskId: "task_1",
      runId: "run_1",
      query: { capability: "search_workspace", query: "needle" },
    });
    expect(search.content).toContain("sample.txt:2:needle here");
  });

  it("rejects unsupported shell capability with a typed error", async () => {
    const root = await workspace();
    const broker = new ContextBroker();
    await broker.createManifest(scope(root));

    await expect(broker.fetch({
      bindingId: "bind_1",
      taskId: "task_1",
      runId: "run_1",
      query: { capability: "shell", query: "whoami" },
    })).rejects.toMatchObject({ code: "CONTEXT_CAPABILITY_UNSUPPORTED" } satisfies Partial<ContextBrokerError>);
  });

  it("rejects an opaque ref when requested from another registered run", async () => {
    const root = await workspace();
    const broker = new ContextBroker({ runtimeEvidence: new RuntimeEvidenceSource(new EvidenceProvider()) });
    const run1 = await broker.createManifest(scope(root, "run_1"));
    await broker.createManifest(scope(root, "run_2"));
    const ref = run1.available.find((item) => item.capability === "execution_summary")!.ref;

    await expect(broker.fetch({
      bindingId: "bind_1",
      taskId: "task_1",
      runId: "run_2",
      ref,
    })).rejects.toMatchObject({ code: "CONTEXT_SCOPE_MISMATCH" });
  });

  it("chunks UTF-8 safely using opaque continuations", async () => {
    const root = await workspace();
    await writeFile(join(root, "unicode.txt"), "甲乙丙丁戊己庚辛", "utf8");
    let nextId = 0;
    const broker = new ContextBroker({
      responseBudgetBytes: 7,
      reviewCycleBudgetBytes: 100,
      id: () => `id_${nextId++}`,
    });
    await broker.createManifest(scope(root));

    const first = await broker.fetch({
      bindingId: "bind_1",
      taskId: "task_1",
      runId: "run_1",
      query: { capability: "read_file", path: "unicode.txt" },
    });
    expect(first.content).toBe("甲乙");
    expect(first.truncated).toBe(true);
    expect(first.continuation).toMatch(/^cont_/);

    const second = await broker.fetch({
      bindingId: "bind_1",
      taskId: "task_1",
      runId: "run_1",
      continuation: first.continuation,
    });
    expect(second.content.startsWith("丙")).toBe(true);
  });

  it("rejects wrong-run continuation and enforces the review-cycle budget", async () => {
    const root = await workspace();
    await writeFile(join(root, "long.txt"), "abcdefghijklmnop", "utf8");
    let nextId = 0;
    const broker = new ContextBroker({
      responseBudgetBytes: 5,
      reviewCycleBudgetBytes: 5,
      id: () => `id_${nextId++}`,
    });
    await broker.createManifest(scope(root, "run_1"));
    await broker.createManifest(scope(root, "run_2"));

    const first = await broker.fetch({
      bindingId: "bind_1",
      taskId: "task_1",
      runId: "run_1",
      query: { capability: "read_file", path: "long.txt" },
    });

    await expect(broker.fetch({
      bindingId: "bind_1",
      taskId: "task_1",
      runId: "run_2",
      continuation: first.continuation,
    })).rejects.toMatchObject({ code: "CONTEXT_SCOPE_MISMATCH" });

    await expect(broker.fetch({
      bindingId: "bind_1",
      taskId: "task_1",
      runId: "run_1",
      continuation: first.continuation,
    })).rejects.toMatchObject({ code: "CONTEXT_BUDGET_EXCEEDED" });
  });
});
