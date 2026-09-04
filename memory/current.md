# Current State

Updated: 2026-09-04 (Asia/Shanghai)

- Local clone is on `feat/v0.2-chatgpt-transport`; Task 14 checkpoint `921b8f5` is pushed.
- Task 13 checkpoints `706f5f8` and `c49ef34` are pushed. Final CI run `33831460444` passed on Ubuntu and Windows.
- Task 14 Background Web Companion is complete. CI run `33832514063` passed on Ubuntu and Windows.
- Task 15 supervisor connectivity, doctor, and security hardening is complete in `611b0c8`.
- Task 15 CI run `33833369175` passed Ubuntu; Windows exposed two overloaded browser-fixture tests exceeding Vitest's 5-second default. Follow-up `b7cb79b` scopes a 30-second ceiling to the three browser-fixture suites and is awaiting CI.
- Task 16 durable V0.2 end-to-end loop is locally complete and awaiting checkpoint commit/CI.
- PR #2 is open and Draft.
- Historical CI for this checkpoint is green on Ubuntu and Windows.
- Tasks 1-11 are represented in the branch history.
- Current automated verification passed: typecheck, 44 test files / 123 tests, and build.
- Task 12 live results: all seven criteria PASS. Desktop/Web messages synchronized after reopening the Desktop conversation, revealing latency rather than loss of the shared cloud anchor.
- Initial login inside Playwright was blocked by login safety/verification behavior; ordinary Chrome using the same dedicated profile provided a successful manual-login bootstrap, and Playwright persistence passed afterward.
- Task 12 hard gate is PASS.
- Task 13 production Extension and Playwright semantic page drivers are complete. The live production smoke passed matching identity, semantic submit, generation lifecycle, and correlated assistant observation on Chrome 152 / Playwright 1.62.1 / Node 24.16.0 / Windows build 26100.
- State-bearing page-driver operations re-check the expected conversation ID and fail closed after a tab switches conversations.
- The companion uses an isolated per-user runtime profile, ordinary Chrome for manual login, and minimized headful Playwright for the persistent background session. Production login reuse passed without sending a message.
- Lease integration keeps background STANDBY under Chrome, acquires a higher epoch after expiry, renews without changing epoch, and preserves one-way DRAINING until safe Chrome handback.
- A pre-commit full run exposed an existing 15 ms fake-page generation race. The fixture now advances streaming deterministically; the focused contract passed 10/10 repeated runs.
- Desktop synchronization latency remains a Task 17 compatibility/documentation follow-up; runtime correctness must not assume immediate Desktop rendering.
- The production doctor correctly distinguishes runtime offline, missing native-host registration, unobserved extension handshake, ready companion profile, and unavailable live page probing without treating an unperformed probe as expired authentication.
- Task 16 covers the complete context-assisted revise/pass path, restart from `RESULT_READY` plus a `SENT` ledger entry without worker rerun or resend, duplicate observations, wrong-binding observations, and durable sequence continuation.
- Next action: commit/push Task 16, confirm Ubuntu/Windows CI, then implement Task 17 packaging and release readiness.
