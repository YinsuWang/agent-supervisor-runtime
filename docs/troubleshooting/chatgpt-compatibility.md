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

## Safe diagnostics

Doctor output contains protocol versions, capability names, paths, and non-secret health state. It must not contain ChatGPT passwords, cookies, tokens, or conversation message contents. Real ChatGPT smoke tests remain manual and outside CI.
