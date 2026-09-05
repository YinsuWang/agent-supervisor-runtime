# Todo

## In progress

- [x] Run `npm install`.
- [x] Run `npm run typecheck`.
- [x] Run `npm test -- --run` (44 files, 128 tests).
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
- [x] Task 17: packaging, docs, CI, and release readiness. (merged through PR #2 at `99ea916`)
- [x] Task 17 follow-up: measure/document Desktop synchronization latency and conversation-reopen recovery (`+5,013 ms` checkpoint; no reopen required).
- [x] Define slim npm package plus separate Windows host Release asset distribution.
- [x] Add package clean-install smoke and package-content assertions.
- [x] Make `package.json` the canonical version source with sync/check scripts.
- [x] Create and verify the `v0.2.0` GitHub Release after main CI passes; both assets are published and their GitHub SHA256 digests match the staged files.

## Post-release

- [x] Attempt isolated Windows acceptance using actual v0.2.0 Release assets (partial pass; see docs/acceptance/2026-09-05-v0.2.0-windows-release.md).
- [x] Wire the documented CLI run/resume path to the real ChatGPT conversation supervisor through the background-web transport.
- [x] Ensure doctor probes cannot satisfy or overwrite Chrome extension handshake evidence.
- [x] Provide and verify self-contained release installation instructions and runnable demo fixtures.
- [x] Repeat full fresh-Windows acceptance with actual Host registration, extension binding, and manual real ChatGPT supervision after fixes (`ACCEPTANCE-022`, final state `COMPLETED`).

## Gate decision

- [x] Record all seven Task 12 results and environment versions.
- [x] Record the initially delayed Desktop/Web synchronization observation.
- [x] Confirm both repeat-run messages eventually appeared after reopening the Desktop conversation.
- [x] Mark Task 12 PASS without changing the approved architecture scope.
