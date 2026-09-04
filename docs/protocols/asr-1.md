# ASR/1 conversation protocol

`ASR/1` is the durable application protocol carried inside one explicitly bound ChatGPT conversation. Messages are UTF-8 JSON objects.

## Common envelope

```json
{
  "protocolVersion": "ASR/1",
  "messageId": "msg_unique",
  "bindingId": "binding_explicit",
  "taskId": "task_1",
  "runId": "run_1",
  "kind": "REVIEW_REQUEST",
  "sequence": 12,
  "correlationId": "optional_prior_message_id"
}
```

Required invariants:

- `messageId` is the durable idempotency key.
- `bindingId`, `taskId`, and `runId` must match the active exchange.
- sequence numbers are non-negative and continue from the persisted maximum after restart.
- replies use `inReplyTo` to reference the exact outbound message.
- wrong-binding, wrong-task, wrong-run, and wrong-correlation replies are rejected.

## Message kinds

- `REVIEW_REQUEST`: compact task/result/test summary plus a manifest of optional evidence references.
- `CONTEXT_REQUEST`: requests exactly one evidence `ref`, bounded query, or continuation token.
- `CONTEXT_RESPONSE`: returns bounded read-only evidence or a typed Context Broker error.
- `REVIEW`: returns `PASS`, `REVISE`, or `ASK_USER`, findings, and an instruction when required.
- `PLAN_REQUEST`, `PLAN`, and `NOTIFICATION` are reserved envelope kinds.

## Durable delivery states

```text
PENDING -> CLAIMED -> SENT -> OBSERVED -> RESPONDED -> CONSUMED
                  \-> PENDING
```

The `CLAIMED -> PENDING` edge is used only when a send fails before accepted delivery is known. A `SENT` or ambiguously delivered request is reconciled against conversation observations before retry. Duplicate observations do not create duplicate ledger entries or worker runs.

## Context limits

Context Broker capabilities are read-only: execution/test summaries, Git status/diff/changed files, bounded file reads, workspace search, and directory listing. Requests are scoped to one binding/task/run and canonical workspace root. Traversal, absolute paths outside the workspace, and symbolic-link escapes are rejected.
