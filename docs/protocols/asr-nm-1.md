# ASR-NM/1 local browser protocol

`ASR-NM/1` connects the Chrome extension, Native Messaging Host, and per-user runtime. Chrome framing uses a 32-bit native-endian message length; runtime IPC uses a 32-bit little-endian length followed by UTF-8 JSON.

## Frame envelope

```json
{
  "protocol": "ASR-NM/1",
  "frameId": "frame_unique",
  "type": "HELLO",
  "sessionId": "optional_until_welcome",
  "timestamp": "2026-09-04T00:00:00.000Z",
  "payload": {}
}
```

Frame types are `HELLO`, `WELCOME`, `COMMAND`, `EVENT`, `ACK`, `ERROR`, and `HEARTBEAT`.

## Handshake

The extension sends `HELLO` with its instance ID, version, and capabilities. The runtime validates the exact protocol and returns `WELCOME` with its instance ID, runtime version, session ID, and `READY` status. Incompatible protocol versions fail validation; the runtime persists non-secret last-handshake health metadata for doctor output.

## Browser command boundary

The Native Host accepts `HELLO`, `HEARTBEAT`, and a strict `BIND_CONVERSATION` command from the browser side. Binding requires matching `conversationId` and canonical `https://chatgpt.com/c/<id>` URL. Unknown fields and command names are rejected before runtime dispatch.

The browser channel does not expose shell execution, arbitrary filesystem reads, Git writes, direct Codex execution, or general local RPC.

## Lease fencing

Each binding permits one ACTIVE transport writer. A durable positive lease epoch is passed with every send. Expired or replaced epochs fail with `STALE_LEASE`. A higher-priority transport waits for an in-flight exchange to drain before handoff.

## Limits

- Runtime IPC frame limit: 1 MiB.
- Native Messaging input/output limits are enforced by the framing implementation.
- Native Host registration is restricted to one exact Chrome extension origin.
- Windows runtime IPC uses a per-runtime-home named pipe; setup and registration are current-user scoped.
