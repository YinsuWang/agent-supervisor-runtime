import { realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { ContextBrokerError } from "./contracts.js";

export class WorkspacePolicy {
  readonly workspaceRoot: string;
  readonly canonicalRoot: string;

  private constructor(workspaceRoot: string, canonicalRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.canonicalRoot = canonicalRoot;
  }

  static async create(workspaceRoot: string): Promise<WorkspacePolicy> {
    const resolved = resolve(workspaceRoot);
    const canonical = await realpath(resolved);
    return new WorkspacePolicy(resolved, canonical);
  }

  async resolvePath(requestedPath: string): Promise<string> {
    if (!requestedPath || requestedPath.includes("\0")) {
      throw new ContextBrokerError("CONTEXT_POLICY_VIOLATION", "Context path is empty or contains NUL");
    }

    const candidate = isAbsolute(requestedPath)
      ? resolve(requestedPath)
      : resolve(this.workspaceRoot, requestedPath);
    this.assertLexicallyInside(candidate);

    try {
      const canonical = await realpath(candidate);
      this.assertCanonicallyInside(canonical);
      return canonical;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    let ancestor = candidate;
    while (true) {
      const parent = dirname(ancestor);
      if (parent === ancestor) {
        throw new ContextBrokerError("CONTEXT_POLICY_VIOLATION", `Cannot resolve workspace ancestor for ${requestedPath}`);
      }
      ancestor = parent;
      try {
        const canonicalAncestor = await realpath(ancestor);
        this.assertCanonicallyInside(canonicalAncestor);
        return candidate;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }

  private assertLexicallyInside(candidate: string): void {
    if (!isWithin(this.workspaceRoot, candidate)) {
      throw new ContextBrokerError("CONTEXT_POLICY_VIOLATION", `Path escapes workspace: ${candidate}`);
    }
  }

  private assertCanonicallyInside(candidate: string): void {
    if (!isWithin(this.canonicalRoot, candidate)) {
      throw new ContextBrokerError("CONTEXT_POLICY_VIOLATION", `Canonical path escapes workspace: ${candidate}`);
    }
  }
}

function isWithin(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
