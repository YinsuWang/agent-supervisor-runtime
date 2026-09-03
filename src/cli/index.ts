#!/usr/bin/env node
import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { runCommand } from "./commands/run.js";
import { resumeCommand } from "./commands/resume.js";
import { statusCommand } from "./commands/status.js";
import { doctorCommand } from "./commands/doctor.js";
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
    const shutdown = async () => {
      await daemon.stop();
      process.exitCode = 0;
    };
    process.once("SIGINT", () => void shutdown());
    process.once("SIGTERM", () => void shutdown());
  });

program.parseAsync().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 4;
});

function exitCodeFor(state: string): number {
  if (state === "COMPLETED") return 0;
  if (state === "BLOCKED") return 2;
  if (state === "FAILED") return 3;
  return 0;
}
