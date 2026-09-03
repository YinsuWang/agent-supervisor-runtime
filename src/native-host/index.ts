#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { defaultRuntimeHome } from "../runtime/daemon.js";
import { NamedPipeIpcClient, runtimeEndpointForHome } from "../runtime/named-pipe.js";
import { NativeHostBridge } from "./bridge.js";

async function main(): Promise<void> {
  const runtimeHome = defaultRuntimeHome();
  const runtimeClient = new NamedPipeIpcClient(runtimeEndpointForHome(runtimeHome));
  const bridge = new NativeHostBridge({
    input: process.stdin,
    output: process.stdout,
    runtimeClient,
    startRuntime: async () => {
      const cliPath = fileURLToPath(new URL("../cli/index.js", import.meta.url));
      const child = spawn(process.execPath, [cliPath, "daemon", "--runtime-home", runtimeHome], {
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
