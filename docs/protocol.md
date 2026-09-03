# Protocol

## Task

A task defines an objective, required instructions, constraints, acceptance criteria, execution directory, and optional budgets. It is schema-validated before any worker side effect.

## Worker result

A result has one of `completed`, `failed`, or `cancelled`, plus changed files, commands, verification evidence, artifacts, and machine-observed process/git evidence.

## Review

A review has exactly one decision:

- `PASS` -> `COMPLETED`
- `REVISE` -> policy check -> `REVISION_READY` or `BLOCKED`
- `ASK_USER` -> `BLOCKED`

A repeated stable finding fingerprint across two consecutive reviews separated by a revision blocks another automatic loop.

## Future Desktop control block

Human-readable supervisor text may end with a validated block:

```text
<orchestrator>
{"version":1,"action":"REVIEW","decision":"PASS"}
</orchestrator>
```

Malformed blocks must never be interpreted as executable intent.
