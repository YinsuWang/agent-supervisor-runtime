import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { companionProfileDirectory, type CompanionProfileOptions } from "./profile.js";

export type CompanionLoginOptions = CompanionProfileOptions & {
  chromeExecutable?: string;
  loginUrl?: string;
  spawnChrome?: (executable: string, args: string[]) => ChildProcess;
};

export async function companionLogin(options: CompanionLoginOptions = {}): Promise<{ profileDir: string }> {
  const profileDir = companionProfileDirectory(options);
  const executable = resolve(options.chromeExecutable ?? findChromeExecutable());
  const child = (options.spawnChrome ?? defaultSpawn)(executable, [
    `--user-data-dir=${profileDir}`,
    "--new-window",
    options.loginUrl ?? "https://chatgpt.com/auth/login",
  ]);
  await new Promise<void>((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`Companion Chrome exited from signal ${signal}`));
      else if (code !== 0) reject(new Error(`Companion Chrome exited with code ${code ?? "unknown"}`));
      else resolveExit();
    });
  });
  return { profileDir };
}

export async function companionReset(options: CompanionProfileOptions = {}): Promise<{ profileDir: string; removed: true }> {
  const profileDir = companionProfileDirectory(options);
  await rm(profileDir, { recursive: true, force: true });
  return { profileDir, removed: true };
}

export function findChromeExecutable(env: NodeJS.ProcessEnv = process.env): string {
  const candidates = env.ASR_CHROME_EXECUTABLE ? [env.ASR_CHROME_EXECUTABLE] : [
    join(env.PROGRAMFILES ?? "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
    join(env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe"),
    join(env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "Google", "Chrome", "Application", "chrome.exe"),
  ];
  const executable = candidates.find((candidate) => existsSync(candidate));
  if (!executable) throw new Error("Chrome executable not found; set ASR_CHROME_EXECUTABLE");
  return executable;
}

function defaultSpawn(executable: string, args: string[]): ChildProcess {
  return spawn(executable, args, { stdio: "ignore", windowsHide: false });
}
