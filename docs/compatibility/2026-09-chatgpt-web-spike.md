# ChatGPT Web Feasibility Spike — September 2026

Status: **FAIL — HARD GATE NOT PASSED**

Live run date: 2026-09-04

Task 13 production ChatGPT selector/page-driver work remains blocked. Six Web/profile criteria passed, but Desktop/Web same-conversation synchronization was not repeatable in the tested environment.

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
| Desktop/Web same cloud conversation | FAIL | One initial operator check saw both probe messages in Desktop. On the required repeat run, both new messages were visible in Web but absent from Desktop despite the operator confirming the correct ChatGPT Chat view. The synchronization behavior was therefore not repeatable. |

## Login bootstrap finding

Attempting the initial account login inside a Playwright-launched Chrome context was not viable in this environment:

- Google sign-in reported that the browser might be unsafe;
- direct account/password login returned HTTP 400 with an unexpected HTML content type;
- repeated refreshes entered a human-verification loop.

The compliant workaround for the feasibility probe was to start ordinary Chrome with only the dedicated `--user-data-dir`, let the operator log in manually, close that ordinary Chrome instance, and then let Playwright reuse the same browser-managed profile. No automation flags, remote-debugging port, credential copying, CAPTCHA solving, OCR, or coordinate automation were used for the login. This bootstrap succeeded and the subsequent persistence check passed.

## Failure mode and boundary

The material failure is not Web DOM access: identity, semantic input, background operation, streaming lifecycle, response correlation, and persistent authentication all passed. The failed assumption is that a newly written ordinary Chat conversation is a reliably observable shared cloud anchor in ChatGPT Desktop in this environment.

The observed evidence does not establish whether the root cause is account/workspace synchronization state, client cache/session state, product rollout behavior, or a service defect. The probe intentionally did not inspect account identifiers or private content, so it cannot distinguish those possibilities locally.

OpenAI documentation states that chats created in Chat should sync between ChatGPT Web and Desktop, while unsaved Temporary Chats do not appear in history. The operator confirmed the correct Desktop Chat location, but the repeat-run messages still did not appear.

## Gate decision

**FAIL.** Criterion 7 is material and non-repeatable, so the mandatory Task 12 gate is not passed. Task 13 and all dependent Tasks 14–17 must not begin under the approved plan.

No OCR, coordinate clicking, Desktop UI Automation, Win32 input injection, credential extraction, or hidden API workaround is authorized by this result.

## Architecture-review alternatives

1. Diagnose the Web/Desktop synchronization discrepancy as a product/account/workspace issue using an explicit non-temporary Chat, verified matching workspace, Desktop restart/sign-out/sign-in, an observation interval, and OpenAI Support if needed. Repeat the gate only after that cause is resolved.
2. Amend V0.2 scope to support ChatGPT Web/Chrome as the human surface and defer Desktop compatibility. This changes the approved product scope and requires explicit architecture approval.
3. Replace the Desktop compatibility promise with a separately approved, officially supported conversation transport if one becomes available. Do not infer private ChatGPT APIs or copy browser credentials.

## Manual commands

```powershell
npm run test:chatgpt-login
npm run test:chatgpt-spike
npm run test:chatgpt-persistence
```

The login and persistence helpers are manual-only and remain excluded from `npm test` and CI.

## Official references

- [OpenAI login troubleshooting](https://help.openai.com/en/articles/7426629-why-cant-i-log-in-to-chatgpt)
- [OpenAI CAPTCHA troubleshooting](https://help.openai.com/en/articles/8184038)
- [ChatGPT Work and Codex — Web/Desktop chat synchronization](https://help.openai.com/en/articles/20001275/)
- [Temporary Chat FAQ](https://help.openai.com/en/articles/8914046-temporary-chat-faq/)
