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

## 2026-09-04 — Task 13 production semantic page drivers

- Implemented shared ChatGPT semantic compatibility profile plus production Chrome-extension and Playwright page-driver backends.
- Added fail-closed conversation identity checks, semantic composer submission, message observation/deduplication, cursor validation, and `IDLE` / `GENERATING` / `INTERRUPTED` / `ERROR` lifecycle detection.
- Extended the narrow extension protocol for page-driver inspection, submission, observation, generation state, and health without adding a general execution surface.
- Added deterministic browser coverage for duplicate mutations, interrupted/retry states, wrong-conversation rejection, and asynchronously rendered send controls.
- Live smoke passed on Chrome 152.0.7977.65, Playwright 1.62.1, Node v24.16.0, and Windows 10.0.26100: both backends matched identity, extension submission was observed, generation transitioned to idle, and the correlated assistant reply was readable.
- Review hardening: all state-bearing protocol operations require an expected conversation ID and re-check it before accessing page state.
- Verification before checkpoint passed: typecheck, 37 Vitest files / 101 tests, extension build, and package build.
- First remote CI run passed Windows but Ubuntu timed out while three browser suites launched Chrome concurrently under Vitest's 10-second default hook timeout; no test assertion failed.
- Raised only the browser-startup hook ceiling to 30 seconds and made browser cleanup tolerant of partial setup. Business timing and pass/fail assertions remain unchanged.
- Follow-up checkpoint `c49ef34` passed CI on Ubuntu and Windows in run `33831460444`.
- Decision: Task 13 is complete; begin Task 14 Background Web Companion.

## 2026-09-04 — Task 14 Background Web Companion

- Added a dedicated companion profile resolver that rejects project-state and default-Chrome profile overlap.
- Added `orchestrator companion login` using ordinary Chrome and `orchestrator companion reset` scoped to the resolved ASR-owned profile.
- Implemented `BackgroundWebTransport` over the production Playwright page driver with explicit binding checks, lease fencing/renewal, standby behavior, correlated response observation, and `AUTH_REQUIRED` / `INCOMPATIBLE` details.
- Added one-way DRAINING behavior so periodic reconnects cannot cancel a higher-priority Chrome handback request during an in-flight exchange.
- Integration coverage passed for Chrome ACTIVE -> expiry -> Background epoch+1 ACTIVE -> Chrome return -> drain -> safe handback, plus profile isolation, login/reset lifecycle, auth expiry, and lease renewal.
- Manual production smoke passed: ordinary-Chrome login completed, then minimized headful Playwright reused the same dedicated profile and found an authenticated composer without sending a message. Headless reuse did not expose the composer and remains unsupported in this environment.
- Final local verification passed: typecheck, 39 Vitest files / 106 tests, build, and companion CLI help.
- Next: commit/push Task 14, confirm Ubuntu/Windows CI, then begin Task 15.
