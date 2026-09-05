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

## 2026-09-04 — Task 15 Supervisor connectivity, doctor, and security hardening

- Confirmed Task 14 checkpoint `921b8f5` passed CI on Ubuntu and Windows in run `33832514063`.
- Added the eight-state supervisor connectivity model while keeping V0.1 task state unchanged across browser, login, DOM, native-host, and runtime-restart events.
- Added doctor probes for runtime IPC handshake, exact HKCU native-host registration, persisted extension protocol handshake, companion profile readiness, and semantic page-driver capabilities.
- The runtime now records non-secret extension handshake health metadata; an unavailable live page probe is reported as degraded rather than incorrectly inferred as expired authentication.
- Hardened the Native Host boundary with a strict `BIND_CONVERSATION` command schema and exact ChatGPT conversation identity validation.
- Added consolidated security coverage for shell-command rejection, lexical and symlink workspace escape, wrong conversation identity, and stale lease fencing.
- Final local verification passed: typecheck, 42 Vitest files / 120 tests, build, and a read-only production doctor smoke.
- Next: commit/push Task 15, confirm Ubuntu/Windows CI, then begin Task 16.

## 2026-09-04 — Task 15 CI follow-up and Task 16 durable supervisor loop

- Task 15 CI run `33833369175` passed Ubuntu. On Windows, two browser-fixture tests completed their operations after Vitest's 5-second per-test default under a heavily delayed runner; all non-browser Task 15 tests passed.
- Follow-up `b7cb79b` raises only the three browser-fixture suite ceilings to 30 seconds; local typecheck and all 10 browser tests passed.
- Added `buildConversationRuntime` as the production wiring entry for a real file store, message ledger, ChatGPT supervisor adapter, Context Broker, worker, and Orchestrator.
- Added a deterministic full V0.2 flow covering review packet, on-demand context, `REVISE`, a second worker run, `PASS`, and durable completion.
- Added restart coverage from persisted `RESULT_READY` plus `SENT`, proving the worker is not rerun, the request is not resent, a repeated resume is idempotent, duplicate observations are ignored, and wrong-binding observations cannot correlate.
- Restart testing exposed sequence reuse after process reconstruction. Default ASR sequence allocation now continues from the maximum persisted binding sequence; injected deterministic generators remain supported.
- Final local verification passed: typecheck, 44 Vitest files / 123 tests, build, and diff check.
- Next: commit/push Task 16, confirm Ubuntu/Windows CI, then begin Task 17.

## 2026-09-04 — Task 17 packaging and release readiness

- Committed and pushed Task 17 as two commits on `feat/v0.2-chatgpt-transport`: `6649bbb` (build: native host SEA packaging, split CI suites, release-artifact smoke) and `995931b` (docs: V0.2 protocol, Windows setup, ChatGPT troubleshooting).
- SEA native-host packaging verified empirically: a minimal SEA probe confirmed `process.argv[1] === process.execPath` at runtime, so the `packaged` branch that self-bootstraps `--asr-daemon` is reliable.
- Local verification passed: typecheck; `test:ci:neutral` 117 tests (2 flaky-timeout cases passed on rerun with a longer ceiling); `test:ci:windows` 6 tests; `test:release-artifact` (exe self-test reports ASR-NM/1, version 0.2.0); full `npm run build`; `npm pack --dry-run` (148 files / 34.4 MB).
- Audit findings recorded, not blocking: `files` ships the 87 MB Windows host exe; version strings duplicated across cli/native-host/doctor/manifest.
- Environment incident: loose refs under `.git/refs/heads` were deleted by external file activity (likely cloud sync of the Documents folder), which made the second commit appear as a root commit. Repaired by repacking refs into `.git/packed-refs`; remote confirmed at `995931b`. If this recurs, keep refs packed or move the repo outside the synced folder.
- Next: confirm Ubuntu/Windows CI for `995931b`, then address the Task 17 follow-up (Desktop latency documentation) and plan PR #2 review/merge.

## 2026-09-04 — Task 17 CI confirmed

- CI run #60 (`33839154284`) for `350fc57` on PR #2 passed on both Ubuntu and Windows.
- Ubuntu: typecheck, neutral suite, build, release-artifact smoke all success (Windows-only step correctly skipped).
- Windows: neutral suite, Windows runtime/setup integrations (named-pipe, native-host-runtime, setup-windows), build, and release-artifact smoke all success.
- Next: PR #2 review/merge planning; Task 17 follow-up (Desktop latency documentation) remains open.

## 2026-09-04 — Task 17 follow-up and audit improvements

- Added PR #2 review: all 17 tasks verified implemented (files/commits/CI), plan checkboxes synced, PR moved from Draft to Ready for review, description updated. CI run #61 passed on Ubuntu and Windows (one Windows rerun needed for a browser-fixture hook timeout caused by runner load, not code).
- Documented the ChatGPT Desktop synchronization latency measurement and conversation-reopen recovery in `docs/troubleshooting/chatgpt-compatibility.md`.
- Audit fixes: npm `files` now excludes `dist/native-host-release`, shrinking the tarball from 34.4 MB to 127.3 kB while keeping the built native-host sources; added `src/version.ts` as the single runtime version source and removed scattered `0.2.0` literals from cli/native-host/doctor.
- Local verification passed: typecheck, 117 neutral tests, build, release-artifact smoke, npm pack dry-run.

## 2026-09-04 — Release-readiness follow-up

- Created `codex/v0.2-release-readiness` from merged `main` to close the two audit findings.
- Documented the selected distribution contract: the npm package excludes the large Windows SEA host, while release staging provides the host executable and npm tarball as separate GitHub Release assets.
- Added `test:package` for package-content and clean-install verification, `stage:release` for reproducible Windows asset staging, and CI execution of the package smoke.
- Made `package.json` the canonical version source and added synchronization/consistency checks for the runtime constant, lockfile, and extension manifest.
- Added a manual Desktop latency smoke. The 2026-09-04 run passed Web delivery and operator-confirmed Desktop visibility at the first `+5,013 ms` checkpoint without requiring a reopen; only timing metadata was retained.
- Increased the timeout budget only for three slow integration tests after local parallel execution repeatedly exceeded Vitest's default 5 seconds; the full suite then passed 44 files / 123 tests.
- Release assets staged locally: `agent-supervisor-runtime-host-v0.2.0-win-x64.exe` and `agent-supervisor-runtime-0.2.0.tgz`.
- Next: commit/push, confirm branch CI, create the `v0.2.0` tag and GitHub Release, then update this record with the final release URLs.

## 2026-09-04 — v0.2.0 release completed

- Release-readiness PR #3 (`8607f0a`) was merged into `main` as `0e82a981c24674cdbf893d88d322c389b5a52b84`; main CI #66 (`33855067863`) passed on Ubuntu and Windows.
- Created and pushed annotated tag `v0.2.0` and published the GitHub Release: https://github.com/YinsuWang/agent-supervisor-runtime/releases/tag/v0.2.0.
- Published npm tarball `agent-supervisor-runtime-0.2.0.tgz` (127,468 bytes) and Windows x64 host `agent-supervisor-runtime-host-v0.2.0-win-x64.exe` (92,547,072 bytes). GitHub asset digests match local SHA256 values: `886607AD5769B595C6ED8C3D2D62E0089C3C60A9DF91D9278BF5E83F36C3EFE2` and `57E1F71F7EFF1E4F1E10C32EAE4F9FBC75DBE83DCCD333C1CCA669824603CA2B`.
- Final status: Task 1–17 and Task 17 Desktop follow-up are complete; no open todo remains. Continue with post-release monitoring on `main`.

## 2026-09-05 — Windows release-package acceptance

- Goal: attempt installation and usage acceptance from actual v0.2.0 assets in isolated directories.
- Changes: added docs/acceptance/2026-09-05-v0.2.0-windows-release.md; updated current state and post-release todo. No implementation changes.
- Verification: independently matched both asset hashes; repeated installed CLI version and Host self-test; reviewed persisted mock task COMPLETED (one revision, two runs) and doctor-generated extension-session evidence; no matching temporary Node/Host processes remained.
- Decision: partial pass only; package smoke does not establish real CLI ChatGPT supervision readiness. Prior no-open-tasks status is superseded by the acceptance findings.
- Remaining: CLI only supports mock supervision, doctor can mistake its own HELLO for an extension handshake, release package lacks README demo fixtures and complete release-install instructions. Actual clean-OS/browser integration remains untested.
- Next: address these gaps, then repeat full installation and manual real-conversation acceptance. No credentials stored, commits or publication performed.

## 2026-09-05 — CLI/ChatGPT connection follow-up

- Goal: repair the documented CLI path so it can construct the real ChatGPT supervisor and make the doctor/package findings actionable.
- Changes: added explicit `chatgpt`/`background-web` configuration and conversation identity validation; wired `buildRuntime`, `run`, and `resume` to `ChatGPTSupervisorAdapter` plus persistent Companion resources; added runtime lease/ledger/context setup and cleanup; separated doctor HELLOs from extension handshake evidence; included examples and docs in npm packaging.
- Verification: focused config/CLI/native-host/doctor tests passed; full suite passed with 44 files and 126 tests; typecheck, build, clean npm package installation, installed package's COMPLETED mock demo, and native-host self-test passed.
- Decision: local source and package workflow is repaired for the background-web transport, but the published v0.2.0 assets were not changed or republished.
- Remaining: perform fresh Windows Host registration, extension binding, Companion login, and a manual real ChatGPT/Codex end-to-end task.
