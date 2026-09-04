# Current State

Updated: 2026-09-04 (Asia/Shanghai)

- Local clone is on `feat/v0.2-chatgpt-transport`; Task 17 packaging/release work is committed and pushed at `995931b`.
- Task 17 (packaging and release readiness) implementation is complete: SEA native-host packaging, release-artifact smoke, split neutral/Windows CI suites, README V0.2 rewrite, and docs (`docs/protocols/asr-1.md`, `docs/protocols/asr-nm-1.md`, `docs/setup/windows-v0.2.md`, `docs/troubleshooting/chatgpt-compatibility.md`).
- Local verification for Task 17 passed: typecheck, `test:ci:neutral` (117 tests), `test:ci:windows` (6 tests), `test:release-artifact`, full `npm run build`, `npm pack --dry-run`.
- Audit note: `package.json` `files` includes the whole `dist/`, so the 87 MB Windows native-host exe ships in the npm tarball; version strings are duplicated across cli/native-host/doctor/manifest. Optional follow-ups, not blocking.
- Environment note: loose git refs under `.git/refs/heads` were deleted by external file activity (Documents folder under cloud sync). Fixed by packing refs into `packed-refs`. Keep references packed or move the repo outside the synced folder if this recurs.
- PR #2 is open and Draft.
- Historical CI for this checkpoint is green on Ubuntu and Windows.
- Tasks 1-11 are represented in the branch history.
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
- Next action: confirm Ubuntu/Windows CI for `995931b`, then address Task 17 follow-up (Desktop latency documentation) and PR #2 review/merge planning.
