import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 1024 * 1024;

export async function readGitStatus(workspaceRoot: string): Promise<string> {
  return await runGit(workspaceRoot, ["status", "--short"]);
}

export async function readGitDiff(workspaceRoot: string): Promise<string> {
  return await runGit(workspaceRoot, ["diff", "--no-ext-diff", "--"]);
}

export async function readChangedFiles(workspaceRoot: string): Promise<string> {
  const status = await readGitStatus(workspaceRoot);
  const paths = status
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
  return [...new Set(paths)].join("\n");
}

async function runGit(workspaceRoot: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", workspaceRoot, ...args], {
    encoding: "utf8",
    maxBuffer: MAX_BUFFER,
    windowsHide: true,
  });
  return stdout;
}
