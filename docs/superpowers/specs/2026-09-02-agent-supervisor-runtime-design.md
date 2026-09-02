# Agent Supervisor Runtime — V0.1 Design

Date: 2026-09-02
Status: Approved architecture, implementation not started
Repository: `YinsuWang/agent-supervisor-runtime`

## 1. Purpose

Agent Supervisor Runtime is a local orchestration runtime for supervisor–worker agent workflows. Its primary target workflow is:

- ChatGPT Desktop Chat acts as the human-facing planner, supervisor, and reviewer.
- Codex acts as the local execution worker.
- A local orchestrator manages durable state, dispatch, retries, review cycles, and policy boundaries.
- The concrete ChatGPT Desktop trigger mechanism is deliberately isolated behind an adapter boundary and is not implemented in V0.1.

The runtime must allow supervisor and worker implementations to be replaced independently without modifying orchestration core logic.

The guiding architectural principle is:

> The orchestrator knows neither ChatGPT Desktop nor Codex internals. It only knows supervisor, worker, state-store, and policy contracts.

## 2. Product Goals

V0.1 must provide a reliable local runtime that can execute and test the complete loop:

`Task -> Worker -> Result -> Review -> PASS | REVISE | ASK_USER`

The implementation must support durable state, crash recovery, bounded automatic revision, machine-observed execution evidence, and pluggable adapters.

The first supported environment is:

- Windows 10/11
- PowerShell 7
- Node.js 20+
- TypeScript as the primary implementation language

The orchestration core should remain cross-platform where practical.

## 3. Non-Goals for V0.1

V0.1 intentionally does not include:

- ChatGPT Desktop UI automation
- automatic Desktop Chat triggering
- ChatGPT Work integration
- Full MCP dependency
- Codex App Server integration
- a web dashboard
- mandatory GitHub integration
- distributed execution
- multi-PC coordination
- parallel worker scheduling
- a database server
- a cloud service
- a general authentication system
- dynamic third-party npm plugin discovery

ChatGPT Desktop integration is an adapter boundary intentionally reserved for a later version. V0.1 proves the orchestration kernel independently of the eventual trigger transport.

## 4. High-Level Architecture

```text
SupervisorAdapter
        |
        v
Task Protocol
        |
        v
PolicyEngine
        |
        v
Orchestrator
        |
        v
WorkerAdapter
        |
        v
CodexExecWorker
        |
        v
Evidence-backed WorkerResult
        |
        v
SupervisorAdapter
        |
        v
Review
   /       |       \
PASS    REVISE   ASK_USER
 |          |         |
DONE     Worker     BLOCKED
```

The V0.1 concrete adapters are:

- `CodexExecWorker` for worker execution
- `MockSupervisorAdapter` / scripted supervisor for testing and local demonstrations
- `FileStateStore` for durable local state

Future adapters may include:

- ChatGPT Desktop supervisor adapter
- Codex App Server worker
- OpenAI MCP supervisor transport
- GitHub-backed task/state integration
- other supervisor or worker agents

These future adapters must not require changes to orchestration core contracts.

## 5. Architectural Approach

The project uses a Worker Adapter architecture rather than binding the orchestrator directly to `codex exec` or designing V0.1 around Codex App Server.

Direct `codex exec` integration would be quick but would couple orchestration semantics to a single worker transport. App Server-first would provide richer agent-loop capabilities but would materially increase V0.1 complexity.

The adapter approach keeps V0.1 small while preserving an upgrade path:

```text
                 Orchestrator
                      |
               WorkerAdapter
                      |
          +-----------+-----------+
          v                       v
   CodexExecWorker          Future AppServerWorker
        V0.1                       later
```

The supervisor side uses the same pattern:

```text
                 Orchestrator
                      |
              SupervisorAdapter
                      |
        +-------------+-------------+
        v                           v
 MockSupervisorAdapter     Future DesktopChatAdapter
        V0.1                       later
```

## 6. Repository Structure

V0.1 is a single TypeScript package rather than a monorepo.

```text
agent-supervisor-runtime/
├─ src/
│  ├─ cli/
│  │  ├─ index.ts
│  │  └─ commands/
│  │     ├─ init.ts
│  │     ├─ run.ts
│  │     ├─ resume.ts
│  │     ├─ status.ts
│  │     └─ doctor.ts
│  ├─ core/
│  │  ├─ orchestrator.ts
│  │  ├─ state-machine.ts
│  │  ├─ policy-engine.ts
│  │  └─ errors.ts
│  ├─ contracts/
│  │  ├─ task.ts
│  │  ├─ result.ts
│  │  ├─ review.ts
│  │  ├─ worker.ts
│  │  ├─ supervisor.ts
│  │  └─ state-store.ts
│  ├─ workers/
│  │  └─ codex-exec/
│  │     ├─ adapter.ts
│  │     ├─ process.ts
│  │     └─ parser.ts
│  ├─ supervisors/
│  │  └─ mock/
│  │     └─ adapter.ts
│  ├─ stores/
│  │  └─ file/
│  │     └─ store.ts
│  ├─ config/
│  │  ├─ schema.ts
│  │  └─ loader.ts
│  └─ utils/
├─ test/
│  ├─ unit/
│  ├─ integration/
│  └─ fixtures/
├─ examples/
│  ├─ basic-task.json
│  └─ mock-review-loop/
├─ docs/
│  ├─ architecture.md
│  ├─ protocol.md
│  └─ adapters.md
├─ package.json
├─ tsconfig.json
├─ README.md
└─ LICENSE
```

## 7. Public Core Contracts

V0.1 exposes only stable orchestration concepts:

- `Orchestrator`
- `WorkerAdapter`
- `SupervisorAdapter`
- `StateStore`
- `PolicyEngine`
- `Task`
- `WorkerResult`
- `Review`
- `RunState`

Codex-specific parsers, CLI internals, and process helpers are implementation details and are not part of the public API.

## 8. Task Protocol

A task is structured data, not an opaque prompt string.

Conceptual TypeScript shape:

```ts
type Task = {
  taskId: string;
  projectId: string;
  objective: string;
  context?: string;
  instructions: string[];
  constraints?: string[];
  acceptanceCriteria: string[];
  artifacts?: {
    expected?: string[];
    forbidden?: string[];
  };
  execution: {
    workingDirectory: string;
    timeoutSeconds?: number;
    allowNetwork?: boolean;
  };
  revision?: {
    parentRunId: string;
    revisionNumber: number;
  };
};
```

Tasks are schema-validated before worker dispatch. Invalid tasks are rejected before any worker side effect occurs.

## 9. Worker Result Protocol

A worker result must contain both the worker's report and machine-observed evidence.

Conceptual shape:

```ts
type WorkerResult = {
  runId: string;
  taskId: string;
  status: "completed" | "failed" | "cancelled";
  summary: string;
  changedFiles: string[];
  commands: CommandResult[];
  verification: VerificationResult[];
  artifacts: ArtifactRef[];
  git?: {
    branch?: string;
    commit?: string;
    diffStat?: string;
  };
  warnings?: string[];
  unresolvedIssues?: string[];
  startedAt: string;
  completedAt: string;
};
```

Large command output is stored in log files rather than embedded wholesale in JSON.

The orchestrator or worker adapter independently records, where available:

- process exit code
- stdout and stderr paths
- execution duration
- `git status`
- changed files
- `git diff --stat`
- `git diff`
- configured verification command results

A worker statement such as "tests passed" is not treated as sufficient evidence without recorded verification where verification is configured.

## 10. Review Protocol

A supervisor review has exactly three workflow decisions:

- `PASS`
- `REVISE`
- `ASK_USER`

Conceptual shape:

```ts
type Review = {
  taskId: string;
  runId: string;
  decision: "PASS" | "REVISE" | "ASK_USER";
  summary: string;
  findings: ReviewFinding[];
  revisionInstructions?: string[];
  userQuestion?: string;
  confidence?: "high" | "medium" | "low";
};
```

A revision may correct implementation within the existing task objective. It may not silently redefine the task's core objective or cross a policy-controlled scope boundary.

## 11. Supervisor Message Format

Future human-facing supervisor implementations may combine readable prose with a machine control block. The runtime protocol reserves this form:

```text
Human-readable supervisor response.

<orchestrator>
{
  "version": 1,
  "action": "REVIEW",
  "decision": "REVISE",
  "revisionInstructions": ["..."]
}
</orchestrator>
```

Supported control actions are initially limited to:

- `DISPATCH`
- `REVIEW`
- `ASK_USER`
- `NO_ACTION`

The runtime validates the control block against a schema. It must not infer or guess an executable action from malformed supervisor output. A malformed or schema-invalid control block transitions the task to `BLOCKED` with reason `SUPERVISOR_RESPONSE_INVALID`; it never dispatches a worker from guessed intent.

The supervisor does not receive direct shell, filesystem-write, or git-commit primitives from the orchestrator. Side effects remain behind worker adapters.

## 12. Codex Prompt Packaging

The Codex worker receives a compiled, self-contained execution prompt generated from the structured task rather than raw ChatGPT conversation history.

The prompt contains:

- task ID and run ID
- objective
- relevant context
- required work
- constraints
- acceptance criteria
- instruction to read repository-level agent instructions such as `AGENTS.md`
- reporting requirements

A revision prompt contains:

- the original task
- relevant previous result summary
- the supervisor review
- explicit revision instructions

This keeps worker context bounded and reduces cross-agent context drift.

## 13. State Machine

V0.1 state transitions are:

```text
CREATED
   |
   v
READY
   |
   v
DISPATCHED
   |
   v
RUNNING
   |
   +-- transient technical failure and retries remain --> RETRY_READY
   |                                                      |
   |                                                      v
   |                                                  DISPATCHED
   |
   +-- technical failure with retry budget exhausted --> FAILED
   |
   v
RESULT_READY
   |
   v
REVIEWING
   |
   +----------- PASS -------------> COMPLETED
   |
   +----------- REVISE -----------> REVISION_READY
   |                                  |
   |                                  v
   |                              DISPATCHED
   |
   +----------- ASK_USER ---------> BLOCKED
   |
   +-- invalid supervisor response -> BLOCKED
                                      |
                                 user decision or
                                 corrected supervisor input
                                      |
                                      v
                                    READY
```

`FAILED` means a technical execution failure whose configured automatic worker retry budget is exhausted or whose error is classified as non-retryable.

`BLOCKED` means the workflow requires human judgment, corrected supervisor input, or has reached an automation safety/budget boundary.

`RETRY_READY` is a technical retry state and does not increment the substantive revision counter.

## 14. Policy Engine

Policy enforcement is a distinct core component rather than ad hoc conditionals in the orchestrator.

Initial API responsibilities include:

```ts
policy.validateTask(task)
policy.validateReview(review)
policy.canAutoRevise(task, review)
```

The default policy includes the following protections.

### 14.1 Revision limit

Default maximum automatic revisions: 3.

After the initial run plus three revisions, another failed review transitions to `BLOCKED`.

### 14.2 Repeated unresolved findings

Every review finding must have a stable fingerprint derived from its normalized category and issue identity. If the same substantive finding is present in two consecutive reviews separated by an attempted revision, the workflow transitions to `BLOCKED` with reason `REPEATED_UNRESOLVED_FINDING` rather than issuing the same automatic revision again.

### 14.3 Scope change guard

The following classes of change must not be silently approved as ordinary revisions when relevant to the task domain:

- changing the core objective
- changing a primary research identification strategy
- changing a main outcome
- replacing a core instrumental variable
- changing sample definitions
- dropping observations or countries as a substantive analytical decision
- changing treatment definitions
- destructive filesystem actions beyond task authorization
- credential or security-policy changes

Such changes require `ASK_USER` or a new explicitly approved task.

### 14.4 Runtime budgets

Tasks may define bounded execution budgets such as maximum runs and wall-clock duration. Budget exhaustion transitions the workflow to `BLOCKED` with a machine-readable reason.

### 14.5 Worker retry is distinct from revision

Technical execution retry and substantive review revision are independent counters.

Transient process errors may be retried according to `maxWorkerRetries` without consuming the review revision budget. A retry creates a new run record linked to the same task and records its retry ordinal independently from revision number.

## 15. Persistent State

V0.1 uses a file-backed state store and no external database.

Example project-local layout:

```text
.orchestrator/
├─ project.json
├─ state.json
├─ tasks/
│  └─ TASK-ID.json
├─ runs/
│  └─ RUN-ID/
│     ├─ task.json
│     ├─ worker-prompt.md
│     ├─ worker-result.json
│     ├─ review.json
│     ├─ stdout.log
│     ├─ stderr.log
│     ├─ diff.patch
│     └─ events.jsonl
└─ reviews/
   └─ RUN-ID.review.json
```

The state-store interface remains replaceable so future SQLite or remote implementations can be added without changing orchestration semantics.

## 16. Crash Recovery and Idempotence

State transitions are persisted durably before the orchestrator proceeds to the next externally visible phase.

The command:

```text
orchestrator resume <task-id>
```

must inspect persisted state and continue from the last completed durable phase.

Already completed successful phases must not be re-executed solely because the orchestrator process restarted.

Recovery behavior is deterministic:

- `CREATED`, `READY`, `RETRY_READY`, and `REVISION_READY` resume from their next normal transition.
- `RESULT_READY` resumes at review without rerunning the worker.
- `REVIEWING` with a persisted review applies that review; without a persisted review it requests review again.
- `COMPLETED`, `FAILED`, and `BLOCKED` do not automatically execute further work.
- `RUNNING` with a persisted worker result is normalized to `RESULT_READY`.
- `RUNNING` without a persisted result is treated as an interrupted worker attempt. V0.1 does not promise arbitrary subprocess reattachment; it records the interruption and applies the worker retry policy. If retry is permitted, it moves to `RETRY_READY`; otherwise it moves to `FAILED`.

A worker run is never duplicated when durable completion evidence for that run already exists.

## 17. Configuration

Project configuration uses:

```text
orchestrator.config.json
```

Initial shape:

```json
{
  "version": 1,
  "worker": {
    "adapter": "codex-exec",
    "command": "codex",
    "defaultTimeoutMinutes": 120
  },
  "supervisor": {
    "adapter": "mock"
  },
  "policy": {
    "maxRevisions": 3,
    "maxWorkerRetries": 2,
    "maxWallClockMinutes": 180
  },
  "state": {
    "adapter": "file",
    "directory": ".orchestrator"
  }
}
```

Repository configuration contains only non-sensitive values. Future credentials or tokens belong in environment variables or operating-system credential storage rather than committed configuration.

## 18. Adapter Registration

V0.1 uses an internal adapter registry rather than dynamic package discovery.

Initially registered adapters are:

- worker: `codex-exec`
- supervisor: `mock`
- state store: `file`

The runtime defines stable adapter contracts now, while package-based third-party plugin loading is deferred until real extension pressure exists.

## 19. CLI

V0.1 CLI commands are intentionally small:

```text
orchestrator init
orchestrator run <task>
orchestrator resume <task-id>
orchestrator status [task-id]
orchestrator doctor
```

### `init`

Creates project configuration and state directory structure without destructive overwrite.

### `run`

Loads and validates a task, dispatches a worker, persists the result, requests review, and follows policy-controlled PASS/REVISE/ASK_USER transitions.

### `resume`

Restores a previously started task from durable state.

### `status`

Reports task state, current run, revision count, retry count, worker adapter, block/failure reason when present, and elapsed timing information.

### `doctor`

Checks environment prerequisites relevant to the configured adapters, including Node runtime, Codex command availability, working-directory validity, and writable state storage.

## 20. Events and Observability

Each run writes append-only structured events to `events.jsonl`.

Representative events include:

- `task.created`
- `task.validated`
- `task.dispatched`
- `worker.started`
- `worker.completed`
- `worker.failed`
- `worker.interrupted`
- `worker.retry_scheduled`
- `result.persisted`
- `review.requested`
- `review.pass`
- `review.revise`
- `review.ask_user`
- `supervisor.response_invalid`
- `task.blocked`
- `task.completed`

This event stream is the future integration surface for dashboards and remote observers; V0.1 does not require a dashboard.

## 21. Git and GitHub Boundaries

The runtime does not require GitHub.

Git may be used by `CodexExecWorker` and evidence collection when the target working directory is a Git repository. Git-specific evidence fields are absent or empty for non-Git working directories; non-Git execution remains valid unless a task explicitly requires Git artifacts.

Future GitHub capabilities may be implemented as separate adapters or sinks, such as:

- GitHub task source
- GitHub audit sink
- GitHub-backed state store

They must not become hidden dependencies of orchestration core logic.

## 22. Testing Strategy

Implementation will follow test-driven development.

### 22.1 Unit tests

Unit coverage includes:

- state-machine transitions
- policy validation
- task validation
- review validation
- revision counters
- worker retry counters
- scope guards
- runtime budget enforcement
- repeated-finding handling
- file state persistence
- recovery decisions

### 22.2 Adapter contract tests

Reusable contract suites validate:

- `WorkerAdapter`
- `SupervisorAdapter`
- `StateStore`

A future adapter must be able to run the relevant contract suite without understanding orchestrator internals.

### 22.3 Integration tests

Default integration tests use fake/scripted adapters and do not consume Codex quota.

Required workflows include:

```text
Task -> worker success -> REVISE -> revision worker -> PASS
```

```text
Task -> transient worker failure -> RETRY_READY -> retry -> success
```

```text
Task -> REVISE repeatedly -> revision limit -> BLOCKED
```

```text
Task -> same finding -> revision -> same finding -> BLOCKED
```

```text
Task -> ASK_USER -> BLOCKED -> resume after user decision
```

```text
Task -> persisted RESULT_READY -> process restart -> resume at review without rerunning worker
```

```text
Task -> invalid supervisor control block -> BLOCKED with SUPERVISOR_RESPONSE_INVALID
```

### 22.4 Real Codex integration tests

Tests that invoke the actual Codex CLI are opt-in and separated from default CI, for example:

```text
npm run test:codex
```

Default CI must not unexpectedly consume user Codex quota.

## 23. Error Handling Principles

The orchestrator follows these rules:

1. Validate before side effects.
2. Persist state before advancing durable workflow state.
3. Never infer an executable supervisor action from malformed control data.
4. Distinguish technical retries from substantive revisions.
5. Preserve evidence and logs for failed runs.
6. Prefer `BLOCKED` over unsafe autonomous scope expansion.
7. Do not silently overwrite prior run artifacts.
8. Expose actionable error information through CLI status and persisted events.

## 24. Security Boundary

The supervisor controls intent and review, but local side effects remain behind worker adapters.

The orchestrator validates structured supervisor output before dispatch. The supervisor is not granted raw shell/file-write primitives by the orchestration protocol.

This boundary does not make arbitrary agent-generated tasks inherently safe; it creates a clear enforcement point where project and domain policies can reject prohibited actions before worker execution.

## 25. V0.1 Acceptance Criteria

V0.1 is complete only when all of the following are true:

1. It installs and runs on Windows 10/11 with PowerShell 7 and Node.js 20+.
2. `orchestrator init` initializes configuration and `.orchestrator/` state safely.
3. A JSON task can launch `CodexExecWorker`.
4. The runtime records exit code, stdout/stderr, changed files where observable, git diff information when applicable, and duration.
5. The mock/scripted supervisor can return PASS, REVISE, and ASK_USER.
6. REVISE causes a genuine subsequent worker run with revision context.
7. `maxRevisions` is enforced.
8. technical worker retries are tracked separately from substantive revisions.
9. repeated unresolved findings are blocked according to the two-consecutive-review rule.
10. ASK_USER transitions correctly to BLOCKED.
11. malformed supervisor control data transitions to BLOCKED without worker dispatch.
12. a crashed/interrupted orchestrator can resume from durable state.
13. successful completed phases are not repeated solely because of orchestrator restart.
14. all workflow state is persisted locally.
15. all key transitions are written to `events.jsonl`.
16. orchestration core does not depend on GitHub.
17. orchestration core does not depend on ChatGPT Desktop.
18. `SupervisorAdapter` can be replaced without changing `Orchestrator`.
19. `WorkerAdapter` can be replaced without changing `Orchestrator`.
20. automated tests cover `Task -> Execute -> Review -> Revise -> Pass` end to end using fake/scripted adapters.
21. README instructions let a new user run the demonstration workflow in approximately 5–10 commands.

## 26. Open-Source Positioning

The project should be described primarily as:

> A local supervisor runtime for agentic delegation. It lets a reasoning-oriented supervisor plan and review work while a local coding agent executes it, with durable state, policy-controlled revisions, and pluggable supervisor/worker adapters.

The initial target integration is ChatGPT Desktop Chat as supervisor plus Codex as worker, but the core is intentionally not branded or coupled as a one-off ChatGPT-to-Codex bridge.

This positioning preserves value if future users connect other supervisors or workers and if official desktop integration APIs change over time.

## 27. Version Roadmap Boundary

### V0.1

Deliver the orchestration kernel, contracts, policy engine, file state store, CLI, Codex Exec worker, mock/scripted supervisor, recovery, evidence collection, and automated tests.

### Post-V0.1

The next integration milestone is a real ChatGPT Desktop supervisor adapter. Its transport may use Windows UI Automation, an accessibility bridge, a future official desktop API, MCP, or another mechanism. The chosen trigger implementation must satisfy the existing `SupervisorAdapter` contract rather than alter orchestration core semantics.

Codex App Server support is likewise a future `WorkerAdapter` implementation.

## 28. Design Invariants

The following invariants are mandatory unless a future design revision explicitly changes them:

1. Supervisor and worker are separate roles.
2. The orchestrator is a deterministic runtime/router, not an additional reasoning agent.
3. The orchestrator depends on contracts, not ChatGPT or Codex internals.
4. Supervisor output is validated before execution.
5. Side effects occur through workers, not directly through the supervisor protocol.
6. Automatic revision is bounded by policy.
7. Human judgment boundaries are represented by ASK_USER/BLOCKED rather than silent scope changes.
8. Durable state permits recovery without blindly repeating completed work.
9. Worker claims are supported by machine-observed evidence where practical.
10. GitHub, cloud services, and Desktop UI automation remain optional integrations rather than core dependencies.
