# Architecture

Agent Supervisor Runtime is a durable supervisor–worker orchestration kernel. The core depends on four replaceable contracts:

```text
SupervisorAdapter -> Orchestrator -> WorkerAdapter
                         |
                    PolicyEngine
                         |
                     StateStore
```

V0.1 ships a scripted `MockSupervisorAdapter`, `CodexExecWorker`, and `FileStateStore`. The intended future supervisor is ChatGPT Desktop Chat, but Desktop automation is deliberately outside V0.1.

## Durable loop

The orchestrator persists each phase before proceeding to the next external side effect. Technical worker retry uses `RETRY_READY`; substantive supervisor revision uses `REVISION_READY`. They have independent counters and limits.

Worker results include both agent-provided text and machine-observed evidence such as process exit status, logs, git status/diff, and configured verification commands.

## Safety boundary

The supervisor cannot directly execute shell commands or mutate files through the orchestration core. It emits structured tasks and reviews; all execution side effects remain behind a worker adapter. Policy can block revisions that exceed budgets, repeat unresolved findings, or require a user decision.
