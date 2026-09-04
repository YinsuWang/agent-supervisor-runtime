# Windows V0.2 setup

## What is installed

ASR uses current-user installation only:

- CLI and built files in the cloned or installed package;
- an unpacked Chrome MV3 extension;
- a self-contained Windows Native Messaging Host executable;
- an HKCU Native Messaging registration;
- optional HKCU login startup for the runtime daemon;
- a dedicated companion Chrome profile under `%LOCALAPPDATA%\AgentSupervisorRuntime\companion\chrome-profile`.

Administrator rights are not required for the normal setup.

## Build and initialize

Open PowerShell 7:

```powershell
npm install
npm run build
npm link
orchestrator init
```

`npm run build` produces:

- `dist/cli/index.js` — CLI;
- `extension/dist/*.js` — extension bundles;
- `dist/native-host-release/agent-supervisor-runtime-host.exe` — self-contained Windows Host;
- `dist/native-host-release/agent-supervisor-runtime-host.cjs` — portable bundled source used to build the Host.

Verify the executable independently of the source tree:

```powershell
npm run test:release-artifact
```

## Register the Native Messaging Host

The repository carries a stable development extension ID: `nnolaedbmhibcffbjopphajjkbcnflln`.

```powershell
orchestrator setup `
  --extension-id nnolaedbmhibcffbjopphajjkbcnflln `
  --host-path "$PWD\dist\native-host-release\agent-supervisor-runtime-host.exe"
```

This writes the Host manifest under `%LOCALAPPDATA%\AgentSupervisorRuntime\native-host` and registers its exact path under:

```text
HKCU\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.agent_supervisor_runtime
```

The manifest permits exactly one `chrome-extension://.../` origin. Wildcards are rejected.

## Load and bind the extension

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Select **Load unpacked** and choose the repository's `extension` directory.
4. Confirm the displayed extension ID is `nnolaedbmhibcffbjopphajjkbcnflln`.
5. Open a normal `https://chatgpt.com/c/<conversation-id>` conversation.
6. Open the ASR extension popup and bind the current conversation.

Binding records an explicit conversation identity. A page that changes to another conversation fails closed before sending.

## Prepare the background companion

```powershell
orchestrator companion login
```

Complete ChatGPT login in the ordinary Chrome window opened by ASR, then close that window. The same isolated profile is reused by the background companion. To remove only this ASR-owned profile:

```powershell
orchestrator companion reset
```

## Diagnose

```powershell
orchestrator doctor
```

Doctor checks Node, the worker command, project state storage, runtime IPC, HKCU Host registration, the last extension protocol handshake, companion profile readiness, and live page-driver capabilities when a probe is available. An unavailable live probe is reported as `DEGRADED`; it is not assumed to mean the login expired.

## Optional login startup

```powershell
orchestrator service enable
orchestrator service status
orchestrator service disable
```

## Remove browser integration

```powershell
orchestrator browser uninstall
orchestrator service disable
orchestrator companion reset
```

The browser uninstall removes the HKCU Host registration and its generated manifest. Companion reset removes the dedicated ASR profile, including its ChatGPT session. Project `.orchestrator` task history is unaffected.
