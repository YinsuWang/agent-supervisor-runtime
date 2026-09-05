# Current State

Updated: 2026-09-05 (Asia/Shanghai)

- Local branch `main` is at `254ae95`; the acceptance follow-up fixes are committed and pushed. The published `v0.2.0` release is unchanged.
- CLI configuration now accepts an explicit `supervisor.adapter=chatgpt` binding with the `background-web` transport. `buildRuntime` constructs the real `ChatGPTSupervisorAdapter`, persistent Companion transport, file-backed lease coordinator, message ledger, and Context Broker; `run`/`resume` close the Companion on exit.
- Doctor probes now label their HELLO as `clientKind=doctor`; the daemon does not persist it as extension health evidence. Doctor also rejects doctor-originated or incomplete extension observations.
- npm packaging now includes `examples` and `docs`; package verification asserts both are present.
- Verification after the changes: `npm run typecheck`, `npm run build`, `npm run test:package` (including running the installed package demo to `COMPLETED`), `npm run test:release-artifact`, and full `npm test -- --run` passed (44 files, 126 tests). The two previously slow tests also passed when rerun alone.
- Main CI run `33941628421` passed on Ubuntu and Windows. Version `0.2.1` is synchronized, built, package-tested, and staged locally in `release-v0.2.1`; asset hashes are recorded in the handoff.
- Real browser login, native-host registration, extension binding, and a live ChatGPT/Codex task remain unverified; `v0.2.1` has not been tagged or published.
- Authority for the original release findings remains `docs/acceptance/2026-09-05-v0.2.0-windows-release.md`; a fresh real-ChatGPT acceptance is still required before declaring the workflow release-ready.
