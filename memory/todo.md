# Todo

## In progress

- [x] Run `npm install`.
- [x] Run `npm run typecheck`.
- [x] Run `npm test -- --run` (35 files, 93 tests).
- [x] Run `npm run build`.
- [x] Audit and correct Task 12 probe behavior against all seven gate criteria.
- [x] Run `npm run test:chatgpt-spike` with the dedicated profile.
- [x] Verify Playwright profile persistence without sending additional messages.
- [x] Prepare and verify the Task 12 failure checkpoint for commit.

## Implementation

- [x] Task 13: production semantic ChatGPT page drivers.
- [x] Task 14: Background Web Companion.
- [x] Task 15: supervisor connectivity, doctor, and security hardening.
- [x] Task 16: durable V0.2 end-to-end loop.
- [x] Task 17: packaging, docs, CI, and release readiness. (committed/pushed `995931b`; confirm Ubuntu/Windows CI after push)
- [ ] Task 17 follow-up: measure/document Desktop synchronization latency and conversation-reopen recovery.

## Gate decision

- [x] Record all seven Task 12 results and environment versions.
- [x] Record the initially delayed Desktop/Web synchronization observation.
- [x] Confirm both repeat-run messages eventually appeared after reopening the Desktop conversation.
- [x] Mark Task 12 PASS without changing the approved architecture scope.
