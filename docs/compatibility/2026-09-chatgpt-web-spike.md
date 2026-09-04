# ChatGPT Web Feasibility Spike — September 2026

Status: **PASS — HARD GATE PASSED**

Live run date: 2026-09-04

All seven feasibility criteria passed. Desktop/Web synchronization was eventually consistent in the tested environment, but the repeat-run messages appeared only after reopening the Desktop conversation. The latency remains a compatibility risk to revisit during Task 17 release readiness.

## Environment

| Component | Version |
| --- | --- |
| Windows | Windows 11, build 26100 (`10.0.26100`) |
| Chrome | `152.0.7977.65` |
| Playwright | `1.62.1` |
| Node.js | `v24.16.0` |

The probe used a dedicated persistent Chrome profile under the ASR user runtime home. It did not use the default Chrome profile and did not read, export, or record cookies, access tokens, passwords, account identifiers, conversation identifiers, private message content, or screenshots.

## Results

| Criterion | Result | Semantic evidence |
| --- | --- | --- |
| Conversation identity identified | PASS | After the first semantic submission materialized the new conversation, the page URL exposed a stable `chatgpt.com/c/<id>` identity. |
| Semantic composer submit | PASS | A visible editable `textbox` role accepted DOM/browser editing input; a visible enabled button with an accessible Send/发送 name submitted it; the matching user message appeared under `data-message-author-role="user"`. |
| Background-tab send/observation | PASS | With a separate blank tab kept in the foreground, the bound ChatGPT tab accepted a semantic submission and exposed both the matching user message and the following assistant message through DOM observation. |
| Streaming completion detection | PASS | A visible accessible Stop/停止 generation control appeared and disappeared; the correlated assistant content then reached a stable DOM state. No fixed sleep was used as the completion decision. |
| Correlated assistant response readable | PASS | The first assistant message after the uniquely marked user probe was readable through ordered `data-message-author-role` message nodes and stabilized across samples. |
| Persistent Playwright profile reuses manual login | PASS | After closing the Playwright persistent context, a fresh context using the same dedicated profile reopened the exact bound `/c/<id>` page with an editable composer and no additional login. |
| Desktop/Web same cloud conversation | PASS | Both probe rounds eventually appeared in the same Desktop Chat conversation. During the repeat run, the new messages were initially absent and became visible after reopening the conversation, demonstrating a shared cloud anchor with observable synchronization latency. |

## Login bootstrap finding

Attempting the initial account login inside a Playwright-launched Chrome context was not viable in this environment:

- Google sign-in reported that the browser might be unsafe;
- direct account/password login returned HTTP 400 with an unexpected HTML content type;
- repeated refreshes entered a human-verification loop.

The compliant workaround for the feasibility probe was to start ordinary Chrome with only the dedicated `--user-data-dir`, let the operator log in manually, close that ordinary Chrome instance, and then let Playwright reuse the same browser-managed profile. No automation flags, remote-debugging port, credential copying, CAPTCHA solving, OCR, or coordinate automation were used for the login. This bootstrap succeeded and the subsequent persistence check passed.

## Failure mode and boundary

Web DOM access passed for identity, semantic input, background operation, streaming lifecycle, response correlation, and persistent authentication. The Desktop/Web test also established a shared cloud conversation anchor, but not immediate propagation.

The observed evidence does not establish whether the delay came from network latency, client cache/session state, or service propagation. The probe intentionally did not inspect account identifiers or private content, so it cannot distinguish those possibilities locally.

OpenAI documentation states that chats created in Chat should sync between ChatGPT Web and Desktop, while unsaved Temporary Chats do not appear in history. The eventual repeat-run observation is consistent with that documented shared history, with added latency in this environment.

## Gate decision

**PASS.** All seven material criteria were observed without prohibited automation. Task 13 may proceed under the approved plan.

No OCR, coordinate clicking, Desktop UI Automation, Win32 input injection, credential extraction, or hidden API workaround is authorized by this result.

## Known limitation and release follow-up

1. Treat Desktop visibility as eventually consistent; runtime correctness must rely on the Web transport observation and durable ledger rather than immediate Desktop rendering.
2. During Task 17, repeat the manual smoke with a measured observation window and document expected troubleshooting steps such as reopening the conversation.
3. If latency becomes operationally material, investigate account/workspace/client state or OpenAI Support before changing the approved architecture. Do not infer private ChatGPT APIs or copy browser credentials.

## Manual commands

```powershell
npm run test:chatgpt-login
npm run test:chatgpt-spike
npm run test:chatgpt-persistence
npm run test:chatgpt-driver-smoke
npm run test:companion-session
npm run test:chatgpt-desktop-latency
```

The login and persistence helpers are manual-only and remain excluded from `npm test` and CI.

`test:chatgpt-desktop-latency` sends one fixed Web probe, asks the operator to confirm Desktop visibility at 5-second checkpoints for up to 2 minutes, and records only the measured timing and whether reopening was required. It does not inspect or persist conversation content, identifiers, credentials, cookies, or screenshots.

### Task 17 follow-up measurement (2026-09-04)

- Environment: Windows 11 build 26100, Chrome 152.0.7977.76, Node 24.16.0.
- The Web probe and correlated assistant response were observed successfully.
- The operator confirmed both probe messages at the first `+5,013 ms` checkpoint; reopening Desktop was not required.
- This is a discrete operator-confirmed observation window with 5-second sampling resolution. The terminal confirmation arrived later, so that input-arrival time is retained only as diagnostic metadata and is not reported as synchronization latency.

## Task 13 production page-driver smoke

The production `ExtensionChatGptPageDriver` and `PlaywrightChatGptPageDriver` completed a live semantic smoke on 2026-09-04 using the environment above. The run confirmed matching conversation identity, non-destructive dynamic-submit capability probing, extension-backed semantic submission, user-message observation, `GENERATING` to `IDLE` lifecycle detection, and a readable correlated assistant response.

The live page renders its Send control only after composer input and its Stop control only during generation. Compatibility checks therefore treat these as state-dependent controls: the submit probe briefly writes and clears a draft without clicking, while the live smoke verifies the generation control after a correlated submission. Stable `data-testid` selectors are isolated in the compatibility profile as fallbacks behind semantic roles and accessible names.

All message observation, generation-state, health, and submission operations carrying a binding expectation re-check the current `/c/<id>` identity and fail closed if the page has switched conversations.

## Task 14 Background Web Companion smoke

The production `orchestrator companion login` flow opened ordinary Chrome with the dedicated per-user runtime profile and completed without reading or copying browser credentials. A subsequent `npm run test:companion-session` run launched the production Playwright persistent context against that same profile and found the authenticated ChatGPT composer without sending a message.

In this environment the proven persistent-session path requires headful Chrome; the companion launches it minimized on Windows. Headless mode did not expose the authenticated composer and is not treated as a supported fallback.

## Official references

- [OpenAI login troubleshooting](https://help.openai.com/en/articles/7426629-why-cant-i-log-in-to-chatgpt)
- [OpenAI CAPTCHA troubleshooting](https://help.openai.com/en/articles/8184038)
- [ChatGPT Work and Codex — Web/Desktop chat synchronization](https://help.openai.com/en/articles/20001275/)
- [Temporary Chat FAQ](https://help.openai.com/en/articles/8914046-temporary-chat-faq/)
