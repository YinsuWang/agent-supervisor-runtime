# Agent Supervisor Runtime

[![CI](https://github.com/YinsuWang/agent-supervisor-runtime/actions/workflows/ci.yml/badge.svg)](https://github.com/YinsuWang/agent-supervisor-runtime/actions/workflows/ci.yml)

Agent Supervisor Runtime (ASR) is a local, durable supervisor-worker runtime. ChatGPT supervises through an explicitly bound conversation, while Codex performs local work through a policy-controlled worker adapter.

V0.2 adds the `ASR/1` conversation protocol, Chrome extension transport, a background web companion, lease fencing, durable message reconciliation, a bounded read-only Context Broker, and separate supervisor connectivity states.

## Requirements

- Node.js 20.19 or newer for the CLI and builds
- Windows 10/11 and PowerShell 7 for the first-class Native Messaging setup
- Google Chrome for the extension and companion transports
- Codex CLI for real `codex-exec` worker runs

## Quick start on Windows

```powershell
git clone https://github.com/YinsuWang/agent-supervisor-runtime.git
Set-Location agent-supervisor-runtime
npm install
npm run build
npm link
orchestrator init
orchestrator setup `
  --extension-id nnolaedbmhibcffbjopphajjkbcnflln `
  --host-path "$PWD\dist\native-host-release\agent-supervisor-runtime-host.exe"
```

Then:

1. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the repository's `extension` directory.
2. Open the exact ChatGPT conversation that will supervise the workspace.
3. Open the extension popup and bind that conversation. ASR never infers a target conversation.
4. If background supervision is needed, run `orchestrator companion login`, finish login in the dedicated ordinary Chrome window, and close it.
5. Run `orchestrator doctor`. Each failed layer is reported separately.
6. Run `orchestrator run path\to\task.json`; use `orchestrator resume TASK-ID` after an interrupted local process.

See [Windows V0.2 setup](docs/setup/windows-v0.2.md) for installation, validation, and removal details.

The npm package intentionally excludes the large Windows Native Messaging Host executable. For a release install, download the matching `agent-supervisor-runtime-host-v<version>-win-x64.exe` from the GitHub Release and pass its path to `orchestrator setup`. A source checkout can continue to use the executable produced by `npm run build`.

## Runtime behavior

- V0.1 task states remain authoritative for work semantics.
- V0.2 connectivity states are orthogonal: `OFFLINE`, `CONNECTING`, `AUTH_REQUIRED`, `RECONCILING`, `STANDBY`, `ACTIVE`, `DEGRADED`, and `INCOMPATIBLE`.
- One binding has at most one ACTIVE writer. Every send is fenced by a durable lease epoch.
- Outbound messages are persisted before sending and deduplicated by `messageId`.
- After restart, ASR reconciles the ledger against conversation observations before any resend.
- Context requests are read-only, run-scoped, budgeted, and restricted to the canonical workspace root.

Protocol references: [ASR/1](docs/protocols/asr-1.md) and [ASR-NM/1](docs/protocols/asr-nm-1.md).

## Commands

```text
orchestrator init
orchestrator run <task.json>
orchestrator resume <task-id>
orchestrator status <task-id>
orchestrator doctor
orchestrator daemon
orchestrator setup --extension-id <id> --host-path <exe>
orchestrator browser install|uninstall
orchestrator companion login|reset
orchestrator service enable|disable|status
```

## Durable state and security

Project task/run state is stored under `.orchestrator/`. Per-user runtime, Native Messaging, health metadata, and the dedicated companion profile live outside project state under `%LOCALAPPDATA%\AgentSupervisorRuntime` by default.

The browser channel accepts only strict transport commands. It cannot invoke a shell or arbitrary filesystem reads. Native Messaging registration is per-user and bound to one exact extension ID. Context Broker path checks reject lexical traversal and symbolic-link escapes. Browser credentials and cookies stay in the dedicated Chrome profile and are not copied into ASR project state.

## Development and release verification

```powershell
npm install
npm run typecheck
npm test -- --run
npm run build
npm run test:release-artifact
npm run test:package
npm pack --dry-run
```

Real ChatGPT compatibility checks are manual-only and never require credentials in CI. See [ChatGPT compatibility troubleshooting](docs/troubleshooting/chatgpt-compatibility.md).

## Zero-Codex demo

The deterministic demo uses Node through the worker process wrapper and consumes no Codex quota:

```powershell
node dist/cli/index.js --config examples/mock-review-loop/orchestrator.config.json run examples/mock-review-loop/task.json
```

Expected final state: `COMPLETED` after one automatic revision.

## License

MIT
