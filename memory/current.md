# Current State

Updated: 2026-09-05 (Asia/Shanghai)

- Local branch `main` is at `4982ee7`; the code fix commit is `f895c33`, CI run `33951919767` passed on Ubuntu and Windows, and the memory-only follow-up CI run `33952168922` also passed.
- `v0.2.1` is tagged and published at https://github.com/YinsuWang/agent-supervisor-runtime/releases/tag/v0.2.1.
- The real CLI path uses an explicit `supervisor.adapter=chatgpt` binding with the `background-web` transport. `buildRuntime` constructs the real ChatGPT supervisor, persistent Companion transport, file-backed lease coordinator, message ledger, and read-only Context Broker; `run`/`resume` close the Companion on exit.
- Doctor probes distinguish `clientKind=doctor` from the real extension handshake. npm packaging includes `examples` and `docs`.
- The final fixes add an explicit ASR/1 `replyContract` to review requests, increase the real page submission observation window to 30 seconds, wait for page readiness after navigation, and close worker stdin so Windows Codex executions do not block waiting for input.
- Local verification passed: `npm run typecheck`, full `npm test -- --run` (44 files, 128 tests), `npm run build`, `npm run test:package` (installed demo `COMPLETED`), and `npm run test:release-artifact` (Host self-test `ASR-NM/1`, version `0.2.1`).
- Real Windows/Chrome acceptance passed with task `ACCEPTANCE-022`: read-only worker exit code 0, `ACCEPTANCE_WORKER_OK`, `git diff --check` passed, ASR/1 review reply correlated, decision `PASS`, both ledger messages `CONSUMED`, and final task state `COMPLETED` with no retry or revision.
- Published assets match local SHA-256 values: npm tarball `4705B1F935AF712B91ECD17D286D7694EAFFE6EF1956524961DEFB923021EC07`; Windows Host `C3BCA75672CECE25BEE590DB63FE477468183B8D0B312D4241B36B6AE02FAD3A`.
- Four local generated staging directories (`release-v0.2.1`, `release-v0.2.1-r2`, `release-v0.2.1-r3`, `release-v0.2.1-r4`) remain untracked for possible local inspection; they were not committed.
- The original v0.2.0 acceptance findings remain historical authority in `docs/acceptance/2026-09-05-v0.2.0-windows-release.md`; the follow-up gaps are now addressed by the v0.2.1 release.
