#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { defaultRuntimeHome } from "../runtime/daemon.js";
import { RuntimeDaemon } from "../runtime/daemon.js";
import { RuntimeProtocolVersion } from "../runtime/contracts.js";
import { NamedPipeIpcClient, runtimeEndpointForHome } from "../runtime/named-pipe.js";
import { NativeHostBridge } from "./bridge.js";

async function main(): Promise<void> {
  if (process.argv.includes("--self-test")) {
    process.stdout.write(`${JSON.stringify({ ok: true, protocol: RuntimeProtocolVersion, version: "0.2.0" })}\n`);
    return;
  }

  const runtimeHome = defaultRuntimeHome();
  if (process.argv.includes("--asr-daemon")) {
    const daemon = new RuntimeDaemon({ runtimeHome, runtimeVersion: "0.2.0" });
    await daemon.start();
    const shutdown = async () => { await daemon.stop(); process.exitCode = 0; };
    process.once("SIGINT", () => void shutdown());
    process.once("SIGTERM", () => void shutdown());
    return;
  }

  const runtimeClient = new NamedPipeIpcClient(runtimeEndpointForHome(runtimeHome));
  const bridge = new NativeHostBridge({
    input: process.stdin,
    output: process.stdout,
    runtimeClient,
    startRuntime: async () => {
      const packaged = process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(process.execPath);
      const args = packaged
        ? ["--asr-daemon"]
        : [join(dirname(resolve(process.argv[1]!)), "..", "cli", "index.js"), "daemon", "--runtime-home", runtimeHome];
      const child = spawn(process.execPath, args, {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      child.unref();
    },
  });

  await bridge.start();
  process.stdin.resume();
  process.stdin.once("end", () => void bridge.stop().catch((error) => console.error((error as Error).message)));
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
