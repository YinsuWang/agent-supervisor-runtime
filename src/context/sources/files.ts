import { open, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import type { WorkspacePolicy } from "../workspace-policy.js";

const DEFAULT_MAX_FILE_BYTES = 256 * 1024;
const DEFAULT_MAX_SEARCH_FILES = 500;
const DEFAULT_MAX_MATCHES = 100;

export async function readWorkspaceFile(
  policy: WorkspacePolicy,
  requestedPath: string,
  maxBytes = DEFAULT_MAX_FILE_BYTES,
): Promise<string> {
  const path = await policy.resolvePath(requestedPath);
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(maxBytes + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const visible = buffer.subarray(0, Math.min(bytesRead, maxBytes)).toString("utf8");
    return bytesRead > maxBytes ? `${visible}\n[truncated at ${maxBytes} bytes]` : visible;
  } finally {
    await handle.close();
  }
}

export async function listWorkspaceDirectory(policy: WorkspacePolicy, requestedPath = "."): Promise<string> {
  const path = await policy.resolvePath(requestedPath);
  const entries = await readdir(path, { withFileTypes: true });
  return entries
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => `${entry.isDirectory() ? "dir" : entry.isFile() ? "file" : "other"}\t${entry.name}`)
    .join("\n");
}

export async function searchWorkspace(
  policy: WorkspacePolicy,
  query: string,
  requestedPath = ".",
): Promise<string> {
  if (!query) throw new Error("Workspace search query must not be empty");
  const root = await policy.resolvePath(requestedPath);
  const matches: string[] = [];
  let visitedFiles = 0;

  async function walk(directory: string): Promise<void> {
    if (visitedFiles >= DEFAULT_MAX_SEARCH_FILES || matches.length >= DEFAULT_MAX_MATCHES) return;
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (visitedFiles >= DEFAULT_MAX_SEARCH_FILES || matches.length >= DEFAULT_MAX_MATCHES) return;
      if (entry.name === ".git" || entry.name === ".orchestrator" || entry.name === "node_modules") continue;
      const absolutePath = join(directory, entry.name);
      const relativePath = relative(policy.canonicalRoot, absolutePath);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        const child = await policy.resolvePath(relativePath);
        await walk(child);
        continue;
      }
      if (!entry.isFile()) continue;
      visitedFiles += 1;
      let content: string;
      try {
        content = await readWorkspaceFile(policy, relativePath, 128 * 1024);
      } catch {
        continue;
      }
      const lines = content.split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        if (lines[index]?.includes(query)) {
          matches.push(`${relativePath}:${index + 1}:${lines[index]}`);
          if (matches.length >= DEFAULT_MAX_MATCHES) break;
        }
      }
    }
  }

  await walk(root);
  return matches.join("\n");
}
