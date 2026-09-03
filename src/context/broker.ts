import { randomUUID } from "node:crypto";
import {
  ContextBrokerError,
  ContextCapabilitySchema,
  ContextManifestSchema,
  ContextRequestSchema,
  ContextResponseSchema,
  ContextScopeSchema,
  type ContextCapability,
  type ContextManifest,
  type ContextRequest,
  type ContextResponse,
  type ContextScope,
} from "./contracts.js";
import { WorkspacePolicy } from "./workspace-policy.js";
import { readChangedFiles, readGitDiff, readGitStatus } from "./sources/git.js";
import { listWorkspaceDirectory, readWorkspaceFile, searchWorkspace } from "./sources/files.js";
import { RuntimeEvidenceSource } from "./sources/runtime-evidence.js";

type EvidenceRecord = {
  ref: string;
  bindingId: string;
  taskId: string;
  runId: string;
  capability: ContextCapability;
  content: string;
};

type ContinuationRecord = {
  token: string;
  bindingId: string;
  taskId: string;
  runId: string;
  capability: ContextCapability;
  remaining: string;
  expiresAt: number;
};

export type ContextBrokerOptions = {
  responseBudgetBytes?: number;
  reviewCycleBudgetBytes?: number;
  continuationTtlMs?: number;
  id?: () => string;
  now?: () => Date;
  runtimeEvidence?: RuntimeEvidenceSource;
};

export class ContextBroker {
  readonly #responseBudgetBytes: number;
  readonly #reviewCycleBudgetBytes: number;
  readonly #continuationTtlMs: number;
  readonly #id: () => string;
  readonly #now: () => Date;
  readonly #runtimeEvidence: RuntimeEvidenceSource;
  readonly #scopes = new Map<string, ContextScope>();
  readonly #refs = new Map<string, EvidenceRecord>();
  readonly #continuations = new Map<string, ContinuationRecord>();
  readonly #cycleUsage = new Map<string, number>();

  constructor(options: ContextBrokerOptions = {}) {
    this.#responseBudgetBytes = positiveBudget(options.responseBudgetBytes ?? 24 * 1024, "responseBudgetBytes");
    this.#reviewCycleBudgetBytes = positiveBudget(options.reviewCycleBudgetBytes ?? 100 * 1024, "reviewCycleBudgetBytes");
    this.#continuationTtlMs = positiveBudget(options.continuationTtlMs ?? 5 * 60_000, "continuationTtlMs");
    this.#id = options.id ?? randomUUID;
    this.#now = options.now ?? (() => new Date());
    this.#runtimeEvidence = options.runtimeEvidence ?? new RuntimeEvidenceSource();
  }

  async createManifest(input: ContextScope): Promise<ContextManifest> {
    const scope = ContextScopeSchema.parse(input);
    const policy = await WorkspacePolicy.create(scope.workspaceRoot);
    const normalizedScope = { ...scope, workspaceRoot: policy.canonicalRoot };
    this.#scopes.set(scopeKey(normalizedScope), normalizedScope);

    const items: ContextManifest["available"] = [];
    const runtimeItems: Array<[ContextCapability, string | undefined]> = [
      ["execution_summary", await this.#runtimeEvidence.executionSummary(normalizedScope)],
      ["test_summary", await this.#runtimeEvidence.testSummary(normalizedScope)],
    ];
    for (const [capability, content] of runtimeItems) {
      if (content !== undefined) items.push(this.#registerEvidence(normalizedScope, capability, content));
    }

    const gitItems: Array<[ContextCapability, () => Promise<string>]> = [
      ["git_status", () => readGitStatus(normalizedScope.workspaceRoot)],
      ["git_diff", () => readGitDiff(normalizedScope.workspaceRoot)],
      ["changed_files", () => readChangedFiles(normalizedScope.workspaceRoot)],
    ];
    for (const [capability, read] of gitItems) {
      try {
        items.push(this.#registerEvidence(normalizedScope, capability, await read()));
      } catch {
        // A workspace need not be a Git repository. Omit unavailable static evidence.
      }
    }

    return ContextManifestSchema.parse({
      bindingId: normalizedScope.bindingId,
      taskId: normalizedScope.taskId,
      runId: normalizedScope.runId,
      available: items,
    });
  }

  async fetch(input: unknown): Promise<ContextResponse> {
    const request = parseContextRequest(input);
    const scope = this.#requireScope(request);

    if (request.ref) return this.#fetchRef(scope, request.ref);
    if (request.continuation) return this.#fetchContinuation(scope, request.continuation);
    if (!request.query) throw new ContextBrokerError("CONTEXT_POLICY_VIOLATION", "Context selector is missing");

    const policy = await WorkspacePolicy.create(scope.workspaceRoot);
    const content = await this.#runQuery(policy, scope, request.query.capability, request.query.path, request.query.query);
    return this.#deliver(scope, request.query.capability, content);
  }

  #registerEvidence(scope: ContextScope, capability: ContextCapability, content: string) {
    const ref = `ctx_${this.#id()}`;
    const record: EvidenceRecord = {
      ref,
      bindingId: scope.bindingId,
      taskId: scope.taskId,
      runId: scope.runId,
      capability,
      content,
    };
    this.#refs.set(ref, record);
    return {
      ref,
      capability,
      summary: summarize(content),
      size: Buffer.byteLength(content, "utf8"),
    };
  }

  #fetchRef(scope: ContextScope, ref: string): ContextResponse {
    const record = this.#refs.get(ref);
    if (!record) throw new ContextBrokerError("CONTEXT_REF_NOT_FOUND", `Unknown context ref: ${ref}`);
    assertScopeMatch(record, scope);
    return this.#deliver(scope, record.capability, record.content);
  }

  #fetchContinuation(scope: ContextScope, token: string): ContextResponse {
    const record = this.#continuations.get(token);
    if (!record) {
      throw new ContextBrokerError("CONTEXT_CONTINUATION_INVALID", `Unknown continuation: ${token}`);
    }
    assertScopeMatch(record, scope);
    if (record.expiresAt <= this.#now().getTime()) {
      this.#continuations.delete(token);
      throw new ContextBrokerError("CONTEXT_CONTINUATION_INVALID", `Expired continuation: ${token}`);
    }
    this.#continuations.delete(token);
    return this.#deliver(scope, record.capability, record.remaining);
  }

  async #runQuery(
    policy: WorkspacePolicy,
    scope: ContextScope,
    capability: ContextCapability,
    path?: string,
    query?: string,
  ): Promise<string> {
    switch (capability) {
      case "execution_summary":
        return (await this.#runtimeEvidence.executionSummary(scope)) ?? "";
      case "test_summary":
        return (await this.#runtimeEvidence.testSummary(scope)) ?? "";
      case "git_status":
        return readGitStatus(scope.workspaceRoot);
      case "git_diff":
        return readGitDiff(scope.workspaceRoot);
      case "changed_files":
        return readChangedFiles(scope.workspaceRoot);
      case "read_file":
        if (!path) throw new ContextBrokerError("CONTEXT_POLICY_VIOLATION", "read_file requires path");
        return readWorkspaceFile(policy, path);
      case "list_directory":
        return listWorkspaceDirectory(policy, path ?? ".");
      case "search_workspace":
        if (!query) throw new ContextBrokerError("CONTEXT_POLICY_VIOLATION", "search_workspace requires query");
        return searchWorkspace(policy, query, path ?? ".");
    }
  }

  #deliver(scope: ContextScope, capability: ContextCapability, content: string): ContextResponse {
    const key = scopeKey(scope);
    const used = this.#cycleUsage.get(key) ?? 0;
    const remainingCycle = this.#reviewCycleBudgetBytes - used;
    if (remainingCycle <= 0) {
      throw new ContextBrokerError("CONTEXT_BUDGET_EXCEEDED", "Review-cycle context budget exhausted");
    }

    const budget = Math.min(this.#responseBudgetBytes, remainingCycle);
    const { head, tail } = splitUtf8(content, budget);
    const deliveredBytes = Buffer.byteLength(head, "utf8");
    this.#cycleUsage.set(key, used + deliveredBytes);

    let continuation: string | undefined;
    if (tail.length > 0) {
      continuation = `cont_${this.#id()}`;
      this.#continuations.set(continuation, {
        token: continuation,
        bindingId: scope.bindingId,
        taskId: scope.taskId,
        runId: scope.runId,
        capability,
        remaining: tail,
        expiresAt: this.#now().getTime() + this.#continuationTtlMs,
      });
    }

    return ContextResponseSchema.parse({ capability, content: head, truncated: tail.length > 0, continuation });
  }

  #requireScope(request: ContextRequest): ContextScope {
    const key = scopeKey(request);
    const scope = this.#scopes.get(key);
    if (!scope) {
      throw new ContextBrokerError("CONTEXT_SCOPE_MISMATCH", "Context scope was not registered by createManifest");
    }
    return scope;
  }
}

function parseContextRequest(input: unknown): ContextRequest {
  if (isRecord(input) && isRecord(input.query) && typeof input.query.capability === "string") {
    const capability = ContextCapabilitySchema.safeParse(input.query.capability);
    if (!capability.success) {
      throw new ContextBrokerError(
        "CONTEXT_CAPABILITY_UNSUPPORTED",
        `Unsupported context capability: ${input.query.capability}`,
      );
    }
  }
  const parsed = ContextRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new ContextBrokerError("CONTEXT_POLICY_VIOLATION", parsed.error.message);
  }
  return parsed.data;
}

function assertScopeMatch(
  record: { bindingId: string; taskId: string; runId: string },
  scope: { bindingId: string; taskId: string; runId: string },
): void {
  if (
    record.bindingId !== scope.bindingId ||
    record.taskId !== scope.taskId ||
    record.runId !== scope.runId
  ) {
    throw new ContextBrokerError("CONTEXT_SCOPE_MISMATCH", "Context evidence belongs to a different scope");
  }
}

function scopeKey(scope: { bindingId: string; taskId: string; runId: string }): string {
  return `${scope.bindingId}\u0000${scope.taskId}\u0000${scope.runId}`;
}

function summarize(content: string): string {
  const firstLine = content.split(/\r?\n/, 1)[0]?.trim() ?? "";
  return firstLine.slice(0, 160) || `${Buffer.byteLength(content, "utf8")} bytes`;
}

function splitUtf8(content: string, maxBytes: number): { head: string; tail: string } {
  if (Buffer.byteLength(content, "utf8") <= maxBytes) return { head: content, tail: "" };
  let bytes = 0;
  let index = 0;
  for (const char of content) {
    const size = Buffer.byteLength(char, "utf8");
    if (bytes + size > maxBytes) break;
    bytes += size;
    index += char.length;
  }
  if (index === 0) {
    throw new ContextBrokerError("CONTEXT_BUDGET_EXCEEDED", "Response budget is too small for one UTF-8 character");
  }
  return { head: content.slice(0, index), tail: content.slice(index) };
}

function positiveBudget(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be positive`);
  return Math.floor(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
