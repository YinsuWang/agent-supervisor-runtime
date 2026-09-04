import { access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { loadConfig } from "../../config/loader.js";
import { defaultRuntimeHome } from "../../runtime/daemon.js";
import { runSupervisorDoctor } from "../../setup/doctor.js";

export type DoctorCheck = { name: string; ok: boolean; detail: string };

export async function doctorCommand(configPath = "orchestrator.config.json"): Promise<DoctorCheck[]> {
  const config = await loadConfig(configPath);
  const base = dirname(resolve(configPath));
  const checks: DoctorCheck[] = [];
  const major = Number(process.versions.node.split(".")[0]);
  checks.push({ name: "node", ok: major >= 20, detail: process.version });
  checks.push(await commandCheck(config.worker.command));

  const stateDir = resolve(base, config.state.directory);
  try {
    await mkdir(stateDir, { recursive: true });
    await access(stateDir, constants.W_OK);
    checks.push({ name: "state", ok: true, detail: stateDir });
  } catch (error) {
    checks.push({ name: "state", ok: false, detail: (error as Error).message });
  }

  for (const check of checks) console.log(`${check.ok ? "OK" : "FAIL"} ${check.name}: ${check.detail}`);
  const supervisorChecks = await runSupervisorDoctor({ runtimeHome: defaultRuntimeHome() });
  for (const check of supervisorChecks) {
    console.log(`${check.ok ? "OK" : "FAIL"} ${check.name} [${check.state}]: ${check.detail}`);
    checks.push({ name: check.name, ok: check.ok, detail: `${check.state}: ${check.detail}` });
  }
  return checks;
}

async function commandCheck(command: string): Promise<DoctorCheck> {
  return await new Promise((resolveCheck) => {
    const child = spawn(command, ["--version"], { windowsHide: true });
    let output = "";
    child.stdout?.on("data", (chunk) => { output += String(chunk); });
    child.stderr?.on("data", (chunk) => { output += String(chunk); });
    const timer = setTimeout(() => child.kill(), 5_000);
    child.once("error", (error) => { clearTimeout(timer); resolveCheck({ name: "worker", ok: false, detail: error.message }); });
    child.once("close", (code) => { clearTimeout(timer); resolveCheck({ name: "worker", ok: code === 0, detail: output.trim() || `exit ${String(code)}` }); });
  });
}
