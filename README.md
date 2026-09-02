# Agent Supervisor Runtime

A local supervisor runtime for durable agent delegation: a reasoning-oriented supervisor plans and reviews work while a local worker executes it, with persistent state, policy-controlled retries/revisions, and pluggable adapters.

The primary target is **ChatGPT Desktop Chat as planner/supervisor/reviewer + Codex as the local execution worker**. V0.1 builds the orchestration kernel first; **ChatGPT Desktop triggering/automation is intentionally not implemented yet** and will be added through the `SupervisorAdapter` boundary.

## Why

Most ad-hoc "ChatGPT plans, Codex executes" workflows still require people to copy prompts between apps, monitor execution, and manually return results for review. This project separates those responsibilities into a durable runtime so the transport to ChatGPT Desktop can evolve independently.

## V0.1 features

- structured Task / WorkerResult / Review protocols
- `PASS`, `REVISE`, `ASK_USER` review loop
- separate technical retry and substantive revision budgets
- repeated-finding and user-decision guards
- file-backed durable state and crash recovery
- `codex exec` worker adapter
- machine-observed exit/log/git/verification evidence
- mock supervisor for deterministic tests and demos
- CLI: `init`, `run`, `resume`, `status`, `doctor`

## Non-goals in V0.1

No ChatGPT Work, Full MCP, Desktop UI automation, mandatory GitHub, Codex App Server, cloud service, database server, distributed workers, or web dashboard.

## Requirements

- Node.js 20+
- Windows 10/11 + PowerShell 7 is the first-class target; the orchestration core is kept cross-platform where practical
- Codex CLI only for real `codex-exec` runs

## Install and build

```bash
git clone https://github.com/YinsuWang/agent-supervisor-runtime.git
cd agent-supervisor-runtime
npm install
npm run build
```

## Zero-Codex demo

The demo uses the real orchestration core and `CodexExecWorker` process wrapper, but injects Node as the command so it consumes no Codex quota.

```bash
npm install
npm run build
node dist/cli/index.js --config examples/mock-review-loop/orchestrator.config.json run examples/mock-review-loop/task.json
node dist/cli/index.js --config examples/mock-review-loop/orchestrator.config.json status DEMO-REVIEW
```

Expected final state: `COMPLETED` after one automatic revision.

## Real Codex configuration

Initialize a project:

```bash
node /path/to/agent-supervisor-runtime/dist/cli/index.js init
```

The generated config uses:

```json
{
  "worker": {
    "adapter": "codex-exec",
    "command": "codex",
    "defaultTimeoutMinutes": 120
  }
}
```

Add a mock review script while the Desktop adapter is not yet implemented, then run:

```bash
orchestrator doctor
orchestrator run path/to/task.json
orchestrator status TASK-ID
orchestrator resume TASK-ID
```

## Durable state

By default state is stored under `.orchestrator/`, including task records, run prompts, stdout/stderr, diffs, worker results, reviews, and `events.jsonl`. Completed durable phases are not repeated simply because the orchestrator process restarted.

## Safety model

The supervisor has no direct shell/filesystem/git write primitives through the core. It supplies Tasks and Reviews; execution side effects are owned by WorkerAdapters. Invalid supervisor data is blocked rather than guessed.

## Extending

See [docs/adapters.md](docs/adapters.md). V0.2's key extension is a ChatGPT Desktop `SupervisorAdapter`; the trigger implementation is intentionally left open while the project evaluates Windows UI Automation, accessibility APIs, and future official interfaces.

## Development

```bash
npm install
npm run typecheck
npm test -- --run
npm run build
```

## License

MIT
