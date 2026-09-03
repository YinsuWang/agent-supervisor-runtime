import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";

const execFileAsync = promisify(execFile);

export type GitEvidence = {
  insideWorkTree: boolean;
  status?: string;
  changedFiles: string[];
  diffStat?: string;
  diffPath?: string;
  branch?: string;
  commit?: string;
};

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  return stdout.trimEnd();
}

export async function collectGitEvidence(cwd: string, diffPath: string): Promise<GitEvidence> {
  try {
    if ((await git(cwd, ["rev-parse", "--is-inside-work-tree"])).trim() !== "true") {
      return { insideWorkTree: false, changedFiles: [] };
    }
  } catch {
    return { insideWorkTree: false, changedFiles: [] };
  }

  const status = await git(cwd, ["status", "--porcelain"]);
  const changedFiles = status
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3).trim())
    .map((path) => path.includes(" -> ") ? path.split(" -> ").at(-1)! : path);
  const diffStat = await git(cwd, ["diff", "--stat"]);
  const diff = await git(cwd, ["diff"]);
  await writeFile(diffPath, diff, "utf8");

  let branch: string | undefined;
  let commit: string | undefined;
  try { branch = await git(cwd, ["branch", "--show-current"]); } catch { /* optional */ }
  try { commit = await git(cwd, ["rev-parse", "HEAD"]); } catch { /* optional */ }

  return { insideWorkTree: true, status, changedFiles, diffStat, diffPath, branch, commit };
}
