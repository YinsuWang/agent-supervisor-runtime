# Adapter contracts

## SupervisorAdapter

`requestReview()` receives a structured task/result package and returns runtime review data. A future ChatGPT Desktop adapter will implement this interface without changing the orchestrator.

## WorkerAdapter

`execute()` receives a task plus a run context containing a compiled worker prompt and run directory. `CodexExecWorker` is the V0.1 implementation. A future Codex App Server worker can replace it behind the same contract.

## StateStore

The store persists tasks, workflow records, prompts, worker results, reviews, and append-only events. V0.1 uses JSON/JSONL files. SQLite or remote stores can be added later without changing state semantics.
