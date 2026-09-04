# Current State

Updated: 2026-09-04 (Asia/Shanghai)

- Working branch: `codex/v0.2-release-readiness`, based on merged `main` commit `99ea916`.
- PR #2 is merged; post-merge CI #64 (`33844983093`) passed on Ubuntu and Windows.
- Release-readiness fixes are implemented: the npm package remains slim and the Windows SEA host is staged as a separate GitHub Release asset; `npm run test:package` verifies package contents, clean installation, and CLI version output.
- `package.json` is the canonical release version source; `npm run sync-version` generates `src/version.ts` and updates the extension manifest, while `npm run check-version` validates package, lockfile, runtime, and manifest consistency.
- Desktop synchronization follow-up completed on 2026-09-04: Web assistant response passed, Desktop visibility was operator-confirmed at the first `+5,013 ms` checkpoint, and reopen was not required. The measurement has 5-second sampling resolution and records no private content.
- Local verification passed: full suite 44 files / 123 tests, typecheck, `test:ci:neutral` (117 tests), `test:ci:windows` (6 tests), build, clean npm package install, release-artifact smoke, and release staging.
- Two long-running integration tests were given 15-second test-local budgets after the local parallel runner repeatedly hit Vitest's default 5-second limit; focused and subsequent full runs passed.
- Staged assets: `release/agent-supervisor-runtime-host-v0.2.0-win-x64.exe` and `release/agent-supervisor-runtime-0.2.0.tgz`. They are ignored locally and ready for the GitHub Release.
- Historical constraints remain: real ChatGPT smoke is manual-only; no credentials, OCR, coordinate automation, or Desktop UI automation is part of the normal path.
- Next action: commit/push this release-readiness branch, wait for CI, then create the `v0.2.0` tag and GitHub Release with both staged assets, and report the final URLs.
