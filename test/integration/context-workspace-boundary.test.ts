import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ContextBroker } from "../../src/context/broker.js";
import { WorkspacePolicy } from "../../src/context/workspace-policy.js";

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function fixture() {
  const parent = await mkdtemp(join(tmpdir(), "asr-context-boundary-"));
  tempDirs.push(parent);
  const workspace = join(parent, "workspace");
  const outside = join(parent, "outside");
  await mkdir(workspace);
  await mkdir(outside);
  await mkdir(join(workspace, "safe"));
  await writeFile(join(workspace, "safe", "inside.txt"), "inside", "utf8");
  await writeFile(join(outside, "secret.txt"), "secret", "utf8");
  return { parent, workspace, outside };
}

describe("context workspace boundary", () => {
  it("rejects parent traversal and absolute paths outside the workspace", async () => {
    const { workspace, outside } = await fixture();
    const broker = new ContextBroker();
    await broker.createManifest({
      bindingId: "bind_1",
      taskId: "task_1",
      runId: "run_1",
      workspaceRoot: workspace,
    });

    await expect(broker.fetch({
      bindingId: "bind_1",
      taskId: "task_1",
      runId: "run_1",
      query: { capability: "read_file", path: "../outside/secret.txt" },
    })).rejects.toMatchObject({ code: "CONTEXT_POLICY_VIOLATION" });

    await expect(broker.fetch({
      bindingId: "bind_1",
      taskId: "task_1",
      runId: "run_1",
      query: { capability: "read_file", path: resolve(outside, "secret.txt") },
    })).rejects.toMatchObject({ code: "CONTEXT_POLICY_VIOLATION" });
  });

  it("rejects a symlink inside the workspace that resolves outside", async () => {
    const { workspace, outside } = await fixture();
    const link = join(workspace, "escape");
    await symlink(outside, link, process.platform === "win32" ? "junction" : "dir");
    const broker = new ContextBroker();
    await broker.createManifest({
      bindingId: "bind_1",
      taskId: "task_1",
      runId: "run_1",
      workspaceRoot: workspace,
    });

    await expect(broker.fetch({
      bindingId: "bind_1",
      taskId: "task_1",
      runId: "run_1",
      query: { capability: "read_file", path: "escape/secret.txt" },
    })).rejects.toMatchObject({ code: "CONTEXT_POLICY_VIOLATION" });
  });

  it("accepts a non-existing path only when its nearest existing ancestor remains inside", async () => {
    const { workspace } = await fixture();
    const policy = await WorkspacePolicy.create(workspace);
    await expect(policy.resolvePath("safe/new/deeper/file.txt")).resolves.toBe(
      resolve(workspace, "safe", "new", "deeper", "file.txt"),
    );
  });
});
