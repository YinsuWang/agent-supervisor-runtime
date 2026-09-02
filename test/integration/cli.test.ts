import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { initCommand } from "../../src/cli/commands/init.js";
import { statusCommand } from "../../src/cli/commands/status.js";
import { FileStateStore } from "../../src/stores/file/store.js";

describe("CLI commands", () => {
  it("initializes without overwriting existing config", async () => {
    const dir = await mkdtemp(join(tmpdir(), "asr-cli-init-"));
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    await initCommand(dir);
    const path = join(dir, "orchestrator.config.json");
    const first = await readFile(path, "utf8");
    await writeFile(path, first.replace('"version": 1', '"version": 1'));
    await initCommand(dir);
    expect(await readFile(path, "utf8")).toBe(first);
  });

  it("reports persisted status", async () => {
    const dir = await mkdtemp(join(tmpdir(), "asr-cli-status-"));
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    await initCommand(dir);
    const store = new FileStateStore(join(dir, ".orchestrator"));
    await store.initialize("demo");
    await store.saveRecord({ taskId: "TASK-1", projectId: "demo", state: "BLOCKED", revisionCount: 1, retryCount: 0, updatedAt: new Date().toISOString() });
    const record = await statusCommand("TASK-1", join(dir, "orchestrator.config.json"));
    expect(record.state).toBe("BLOCKED");
  });
});
