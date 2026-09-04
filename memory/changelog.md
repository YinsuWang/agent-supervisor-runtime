# Changelog

## 2026-09-04 — Context recovery

- Goal: resume V0.2 from Task 12 on `feat/v0.2-chatgpt-transport`.
- Verified local/remote HEAD: `ac4a2678ba3953f53d8891db94cd40d63ed8712e`.
- Verified PR #2 is open and Draft; checkpoint CI succeeded on Ubuntu and Windows.
- Read the approved V0.2 design, implementation plan, architecture direction, README, Task 12 probe, report, and package scripts.
- Decision: preserve the Task 12 hard gate and do not begin Task 13 without seven live PASS results.
- Next: run local automated verification and the manual live spike.

## 2026-09-04 — Task 12 live feasibility gate

- Automated verification passed: typecheck, 35 Vitest files / 93 tests, and build including the Chrome extension bundle.
- Improved the manual spike so response correlation, background observation, streaming lifecycle, conversation materialization, and persistent-login checks measure the required semantics rather than DOM existence alone.
- Added an ordinary-Chrome manual-login bootstrap because account login inside the Playwright-launched browser triggered browser-safety, HTTP 400, and repeated human-verification failures.
- Verified the dedicated Playwright profile can close and reopen the same authenticated `/c/<id>` conversation without another login.
- Live result: conversation identity, composer/submit, background send/observe, streaming completion, assistant response reading, and persistent login passed.
- Material failure: repeat-run messages visible in Web were absent from the confirmed Desktop Chat view. An earlier successful observation was not repeatable.
- Decision: mark Task 12 FAIL, keep Tasks 13-17 blocked, document architecture-review alternatives, and avoid prohibited UI/OCR/credential workarounds.
- Pre-commit verification reproduced a page-driver fixture race: three 15 ms timers could finish before the submit call returned. Replaced timer-driven fake streaming with explicit test-controlled chunk/complete transitions; the focused contract passed 10/10 repetitions without increasing sleeps or timeouts.
- Final verification passed: typecheck, 35 test files / 93 tests, build, and `git diff --check` (line-ending notices only).

## 2026-09-04 — Task 12 gate resolution

- The operator reopened the same Desktop Chat conversation and confirmed both repeat-run Web probe messages were present.
- Reclassified criterion 7 from apparent failure to PASS with synchronization latency; the shared cloud conversation anchor is feasible, but Desktop visibility is not immediate.
- Decision: Task 12 hard gate passes, the approved Web + Desktop architecture remains unchanged, and Task 13 may begin.
- Follow-up: measure and document Desktop synchronization latency during Task 17 release readiness; runtime correctness must remain based on Web transport observations and durable state.
