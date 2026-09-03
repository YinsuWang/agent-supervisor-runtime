# ChatGPT Web Feasibility Spike — September 2026

Status: **PENDING MANUAL LIVE RUN — HARD GATE NOT PASSED**

This report corresponds to the mandatory feasibility gate in the V0.2 conversation transport design. No production ChatGPT selector/page-driver implementation may proceed to Task 13 until all material criteria below have been exercised against a real, logged-in ChatGPT Web conversation.

## Probe

Run from a Windows desktop with Chrome installed:

```powershell
npm install
npm run test:chatgpt-spike
```

The script uses a dedicated persistent Chrome profile under the ASR runtime home by default. It never reads or records cookies, access tokens, passwords, or private conversation contents. Use a disposable ChatGPT conversation because the probe may send two clearly labelled feasibility messages after explicit confirmation.

Optional environment variables:

```powershell
$env:ASR_CHATGPT_SPIKE_PROFILE = "D:\path\to\dedicated-profile"
$env:ASR_CHATGPT_CONVERSATION_URL = "https://chatgpt.com/c/<disposable-conversation-id>"
```

## Required evidence

| Criterion | Result | Evidence to record |
| --- | --- | --- |
| Conversation identity identified | PENDING | `/c/<id>` identity obtained semantically |
| Semantic composer submit | PENDING | editable textbox + semantic send action |
| Background-tab send/observation | PENDING | send/observe works while another tab is foreground |
| Streaming completion detection | PENDING | semantic generation lifecycle anchor |
| Correlated assistant response readable | PENDING | assistant response text readable from DOM |
| Persistent Playwright profile reuses manual login | PENDING | close/relaunch retains authenticated conversation UI |
| Desktop/Web same cloud conversation | PENDING | operator confirms probe messages in ChatGPT Desktop |

## Privacy and evidence rules

Record only capability pass/fail, semantic anchor descriptions, browser/runtime versions, and failure modes. Do not commit cookies, tokens, account identifiers, screenshots containing private conversation content, or message text beyond the fixed probe labels.

## Gate decision

**PENDING.** The current automated environment has no authenticated interactive ChatGPT browser session, so the live spike has not been executed here. This is not a failure of the architecture and is not a PASS. Task 13 remains blocked until a manual live run supplies evidence for all seven criteria.
