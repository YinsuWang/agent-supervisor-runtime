import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { companionLogin, companionReset } from "../../src/companion/login.js";
import { companionProfileDirectory } from "../../src/companion/profile.js";

describe("companion login lifecycle", () => {
  it("starts ordinary Chrome with only the dedicated profile and waits for a clean close", async () => {
    const runtimeHome = await mkdtemp(join(tmpdir(), "asr-companion-login-"));
    let invocation: { executable: string; args: string[] } | undefined;
    const result = await companionLogin({
      runtimeHome,
      projectStateDirectory: join(runtimeHome, "project-state"),
      defaultChromeProfileDirectories: [],
      chromeExecutable: process.execPath,
      spawnChrome: (executable, args) => {
        invocation = { executable, args };
        const child = new EventEmitter() as ChildProcess;
        queueMicrotask(() => child.emit("exit", 0, null));
        return child;
      },
    });

    expect(invocation?.executable).toBe(process.execPath);
    expect(invocation?.args).toEqual([
      `--user-data-dir=${result.profileDir}`,
      "--new-window",
      "https://chatgpt.com/auth/login",
    ]);
  });

  it("reset removes only the resolved companion profile", async () => {
    const runtimeHome = await mkdtemp(join(tmpdir(), "asr-companion-reset-"));
    const options = { runtimeHome, projectStateDirectory: join(runtimeHome, "project-state"), defaultChromeProfileDirectories: [] };
    const profileDir = companionProfileDirectory(options);
    await mkdir(profileDir, { recursive: true });
    await writeFile(join(profileDir, "owned-marker"), "owned", "utf8");

    await expect(companionReset(options)).resolves.toEqual({ profileDir, removed: true });
    await expect(stat(profileDir)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(runtimeHome)).resolves.toBeDefined();
  });
});
