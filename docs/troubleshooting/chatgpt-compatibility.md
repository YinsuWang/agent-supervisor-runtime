# ChatGPT compatibility troubleshooting

## Connectivity states

| State | Meaning | Action |
| --- | --- | --- |
| `OFFLINE` | Runtime or transport is not connected. | Start/restart the runtime or allow companion failover. |
| `CONNECTING` | Reconnection is in progress. | Wait briefly, then run doctor if it persists. |
| `AUTH_REQUIRED` | The live ChatGPT page explicitly requires login. | Run `orchestrator companion login`. |
| `RECONCILING` | Durable state is being matched to observed conversation messages. | Do not resend manually. |
| `STANDBY` | Healthy transport is waiting because another writer owns the lease. | No action. |
| `ACTIVE` | Transport owns the current fenced lease. | No action. |
| `DEGRADED` | A layer or live probe is unavailable, but incompatibility is not established. | Inspect doctor details. |
| `INCOMPATIBLE` | Required semantic page or protocol capability is missing. | Stop automation and update the driver/extension. |

Connectivity failures do not change a task to `FAILED` or `BLOCKED` by themselves.

## Login window reports an unsafe browser

Use `orchestrator companion login`. It opens ordinary installed Chrome with ASR's dedicated profile. Complete the login there and close the window. Interactive login inside a Playwright-controlled window can trigger provider safety checks or repeated human verification and is not the supported bootstrap path.

If the dedicated session is corrupted or belongs to the wrong account:

```powershell
orchestrator companion reset
orchestrator companion login
```

Reset removes only the ASR-owned companion profile.

## `400 Invalid content type: text/html`

This usually occurs in an interrupted or challenged login flow rather than the conversation transport. Close that login window, use the ordinary-Chrome companion login command, finish authentication, and rerun doctor. Do not copy cookies or credentials into project files.

## Repeated “verify you are human” prompts

Stop repeated automated login attempts. Authenticate once through the ordinary Chrome bootstrap window. If the challenge continues, wait for the provider challenge to clear and retry manually; ASR will report `AUTH_REQUIRED` while the live page remains unauthenticated.

## Extension does not connect

1. Confirm the loaded extension ID matches the ID registered by `orchestrator setup`.
2. Run `orchestrator doctor` and inspect `native-host-registration`, `extension-protocol`, and `runtime-ipc` separately.
3. Rebuild and rerun setup after moving the repository because the Host manifest contains a path.
4. Reload the unpacked extension after rebuilding `extension/dist`.

## Page reports `INCOMPATIBLE`

Doctor and the page driver report missing semantic capabilities such as `conversationIdentity`, `composer`, `submit`, `assistantMessages`, or `generationLifecycle`. Automation stops instead of falling back to coordinates or OCR. Record the missing capability names and update the compatibility profile before retrying.

## Web and Desktop messages appear at different times

The same cloud conversation can render later in ChatGPT Desktop than on the web. During the V0.2 feasibility gate, delayed messages appeared after reopening the Desktop conversation. Treat this as synchronization latency: verify the exact conversation ID and reopen the conversation before concluding that a message was lost. Runtime correctness does not assume immediate Desktop rendering.

### Measured behavior (V0.2 feasibility gate, 2026-09-04)

- Environment: Windows 11 build 26100, Chrome 152, Playwright 1.62.1, Node 24.16.0.
- First probe round: Web submission appeared in Desktop without a reopen.
- Repeat probe round: the same cloud conversation initially did not show the new messages in Desktop; they became visible only after the Desktop conversation was reopened.
- The delay did not indicate data loss: after reopen, both the user probe and the assistant reply were present in the shared conversation.

Because the probe intentionally avoided reading account identifiers or private content, the local evidence cannot distinguish network latency, client cache/session state, or service propagation as the cause. It is consistent with the documented behavior that chats created in Chat sync between Web and Desktop, with added synchronization latency in this environment.

### Troubleshooting steps

1. Confirm the Desktop conversation ID equals the bound Web conversation ID (`chatgpt.com/c/<id>`).
2. Reopen the Desktop conversation and wait for the message list to refresh.
3. Re-run `orchestrator doctor`; a healthy `ACTIVE`/`STANDBY` connectivity state with a matching conversation identity means runtime delivery is not the cause.
4. Do not resend manually while the state is `RECONCILING`; the durable ledger reconciles observed messages before any retry.
5. If messages still do not appear after reopening, check whether the conversation is a Temporary Chat; unsaved Temporary Chats are not part of the shared history that Web and Desktop sync.

### How to measure the observation window in a future manual smoke

Run a manual Web submission against the bound conversation, then poll the Desktop conversation at fixed intervals (for example every 5 seconds) until the correlated assistant message is observed, up to a bounded window (for example 2 minutes). Record only the interval at which the message first appeared, never message contents. Report the measured window in the compatibility report. Runtime correctness must not assume immediate Desktop rendering regardless of the measured value.

## Safe diagnostics

Doctor output contains protocol versions, capability names, paths, and non-secret health state. It must not contain ChatGPT passwords, cookies, tokens, or conversation message contents. Real ChatGPT smoke tests remain manual and outside CI.
