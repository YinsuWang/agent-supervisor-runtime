# Project Memory

## Repository

- GitHub: `YinsuWang/agent-supervisor-runtime`
- Active branch: `main` (`v0.2.0` released)
- Goal: maintain the V0.2 ChatGPT Conversation Transport while preserving the approved architecture and security boundaries.

## Authoritative sources

1. `docs/superpowers/specs/2026-09-03-v0.2-chatgpt-conversation-transport-design.md`
2. `docs/superpowers/plans/2026-09-03-v0.2-chatgpt-conversation-transport-implementation.md`
3. `docs/architecture/v0.2-conversation-transport-direction.md`
4. `README.md`

## Long-term constraints

- Task 12 live ChatGPT feasibility spike is a hard gate before Task 13.
- Explicit conversation binding; never infer the target conversation.
- One ACTIVE writer per binding; lease epoch is a fencing token.
- Durable idempotency by `messageId`; reconcile before resend.
- Transport failure must not rerun Codex or become Worker failure.
- ASR/1 and ASR-NM/1 remain separate protocols.
- Context Broker is read-only, bounded, run-scoped, and workspace-scoped.
- No ChatGPT credentials in project/runtime state.
- No OCR, coordinate automation, or Desktop UI Automation in the normal path.
- Real ChatGPT smoke tests remain manual-only and outside CI.

## Stack and target

- TypeScript ESM, Node.js >=20.19, Vitest, Playwright, Chrome MV3/Native Messaging.
- Windows 10/11 and PowerShell 7 are first-class targets.
