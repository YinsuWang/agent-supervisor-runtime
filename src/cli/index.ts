#!/usr/bin/env node
import { Command } from "commander";
import { fileURLToPath } from "node:url";
import { initCommand } from "./commands/init.js";
import { runCommand } from "./commands/run.js";
import { resumeCommand } from "./commands/resume.js";
import { statusCommand } from "./commands/status.js";
import { doctorCommand } from "./commands/doctor.js";
import { browserInstallCommand, browserUninstallCommand } from "./commands/browser.js";
import { setupCommand } from "./commands/setup.js";
import { serviceDisableCommand, serviceEnableCommand, serviceStatusCommand } from "./commands/service.js";
import { companionLoginCommand, companionResetCommand } from "./commands/companion.js";
import { RuntimeDaemon, defaultRuntimeHome } from "../runtime/daemon.js";

const program = new Command();
program.name("orchestrator").description("Local supervisor-worker orchestration runtime").version("0.1.0");
program.option("-c, --config <path>", "configuration file", "orchestrator.config.json");

program.command("init").description("initialize runtime configuration").action(async () => { await initCommand(); });
program.command("run").argument("<task>").description("run a task").action(async (task) => {
  const record = await runCommand(task, program.opts().config);
  process.exitCode = exitCodeFor(record.state);
});
program.command("resume").argument("<task-id>").description("resume a persisted task").action(async (taskId) => {
  const record = await resumeCommand(taskId, program.opts().config);
  process.exitCode = exitCodeFor(record.state);
});
program.command("status").argument("<task-id>").description("show persisted task status").action(async (taskId) => { await statusCommand(taskId, program.opts().config); });
program.command("doctor").description("check configured runtime prerequisites").action(async () => {
  const checks = await doctorCommand(program.opts().config);
  if (checks.some((check) => !check.ok)) process.exitCode = 4;
});
program.command("daemon")
  .description("run the per-user ASR runtime authority in the foreground")
  .option("--runtime-home <path>", "runtime home directory", defaultRuntimeHome())
  .action(async (options: { runtimeHome: string }) => {
    const daemon = new RuntimeDaemon({ runtimeHome: options.runtimeHome, runtimeVersion: "0.2.0" });
    await daemon.start();
    const shutdown = async () => { await daemon.stop(); process.exitCode = 0; };
    process.once("SIGINT", () => void shutdown());
    process.once("SIGTERM", () => void shutdown());
  });

program.command("setup")
  .description("configure the current-user Chrome native messaging bridge")
  .requiredOption("--extension-id <id>", "stable Chrome extension id")
  .requiredOption("--host-path <path>", "native host executable path")
  .option("--runtime-home <path>", "runtime home directory", defaultRuntimeHome())
  .option("--dry-run", "show intended setup without writing files or registry")
  .action(async (options: { extensionId: string; hostPath: string; runtimeHome: string; dryRun?: boolean }) => {
    await requireWindowsOrDryRun(options.dryRun);
    const result = await setupCommand(options);
    console.log(JSON.stringify(result, null, 2));
  });

const browser = program.command("browser").description("manage Chrome native messaging registration");
browser.command("install")
  .requiredOption("--extension-id <id>", "stable Chrome extension id")
  .requiredOption("--host-path <path>", "native host executable path")
  .option("--runtime-home <path>", "runtime home directory", defaultRuntimeHome())
  .option("--dry-run", "show intended changes")
  .action(async (options: { extensionId: string; hostPath: string; runtimeHome: string; dryRun?: boolean }) => {
    await requireWindowsOrDryRun(options.dryRun);
    console.log(JSON.stringify(await browserInstallCommand(options), null, 2));
  });
browser.command("uninstall")
  .option("--runtime-home <path>", "runtime home directory", defaultRuntimeHome())
  .option("--dry-run", "show intended changes")
  .action(async (options: { runtimeHome: string; dryRun?: boolean }) => {
    await requireWindowsOrDryRun(options.dryRun);
    console.log(JSON.stringify(await browserUninstallCommand(options), null, 2));
  });

const service = program.command("service").description("manage optional per-user login startup");
service.command("enable")
  .option("--runtime-home <path>", "runtime home directory", defaultRuntimeHome())
  .option("--dry-run", "show intended changes")
  .action(async (options: { runtimeHome: string; dryRun?: boolean }) => {
    await requireWindowsOrDryRun(options.dryRun);
    const cliPath = fileURLToPath(import.meta.url);
    console.log(JSON.stringify(await serviceEnableCommand({ ...options, cliPath }), null, 2));
  });
service.command("disable")
  .option("--dry-run", "show intended changes")
  .action(async (options: { dryRun?: boolean }) => {
    await requireWindowsOrDryRun(options.dryRun);
    console.log(JSON.stringify(await serviceDisableCommand(options), null, 2));
  });
service.command("status").action(async () => {
  if (process.platform !== "win32") throw new Error("WINDOWS_ONLY");
  console.log((await serviceStatusCommand({})) ? "enabled" : "disabled");
});

const companion = program.command("companion").description("manage the dedicated background ChatGPT profile");
companion.command("login")
  .option("--runtime-home <path>", "runtime home directory", defaultRuntimeHome())
  .option("--chrome-executable <path>", "ordinary Chrome executable used for manual login")
  .action(async (options: { runtimeHome: string; chromeExecutable?: string }) => {
    console.log("Complete ChatGPT login in the dedicated Chrome window, then close that window.");
    console.log(JSON.stringify(await companionLoginCommand(options), null, 2));
  });
companion.command("reset")
  .option("--runtime-home <path>", "runtime home directory", defaultRuntimeHome())
  .action(async (options: { runtimeHome: string }) => {
    console.log(JSON.stringify(await companionResetCommand(options), null, 2));
  });

program.parseAsync().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 4;
});

async function requireWindowsOrDryRun(dryRun?: boolean): Promise<void> {
  if (process.platform !== "win32" && !dryRun) throw new Error("WINDOWS_ONLY");
}

function exitCodeFor(state: string): number {
  if (state === "COMPLETED") return 0;
  if (state === "BLOCKED") return 2;
  if (state === "FAILED") return 3;
  return 0;
}
