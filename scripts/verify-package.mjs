import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundledNpmCli = resolve(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
const npmCli = process.env.npm_execpath ?? (process.platform === "win32" && existsSync(bundledNpmCli) ? bundledNpmCli : undefined);
const npm = npmCli ? process.execPath : (process.platform === "win32" ? "npm.cmd" : "npm");
const tempRoot = await mkdtemp(join(resolve(root, "node_modules"), ".asr-package-smoke-"));
const packageDestination = join(tempRoot, "package");
const installDirectory = join(tempRoot, "install");
await mkdir(packageDestination, { recursive: true });

try {
  const npmOptions = { cwd: root };
  const npmArgs = (args) => npmCli ? [npmCli, ...args] : args;
  const { stdout } = await execFileAsync(npm, npmArgs(["pack", "--json", "--pack-destination", packageDestination]), npmOptions);
  const packResult = JSON.parse(stdout.trim()).at(-1);
  if (!packResult?.filename || !Array.isArray(packResult.files)) throw new Error("npm pack returned no package metadata");

  const paths = packResult.files.map((entry) => entry.path);
  const required = [
    "dist/cli/index.js",
    "extension/dist/service-worker.js",
    "extension/manifest.json",
    "examples/mock-review-loop/orchestrator.config.json",
    "docs/setup/windows-v0.2.md",
  ];
  for (const requiredPath of required) {
    if (!paths.includes(requiredPath)) throw new Error(`Packed npm package is missing ${requiredPath}`);
  }
  if (paths.some((path) => path.startsWith("dist/native-host-release/") || path.endsWith(".exe"))) {
    throw new Error("Packed npm package unexpectedly contains a Windows native-host executable");
  }

  await execFileAsync(npm, npmArgs(["install", "--prefix", installDirectory, "--ignore-scripts", "--no-audit", "--no-fund", resolve(packageDestination, packResult.filename)]), npmOptions);
  const installedCli = join(installDirectory, "node_modules", "agent-supervisor-runtime", "dist", "cli", "index.js");
  const { stdout: versionOutput } = await execFileAsync(process.execPath, [installedCli, "--version"], { cwd: installDirectory });
  const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  if (versionOutput.trim() !== packageJson.version) throw new Error(`Installed CLI version mismatch: ${versionOutput.trim()}`);
  const installedPackageRoot = dirname(dirname(dirname(installedCli)));
  const demoConfig = join(installedPackageRoot, "examples", "mock-review-loop", "orchestrator.config.json");
  const demoTask = join(installedPackageRoot, "examples", "mock-review-loop", "task.json");
  const { stdout: demoOutput } = await execFileAsync(
    process.execPath,
    [installedCli, "--config", demoConfig, "run", demoTask],
    { cwd: installedPackageRoot, maxBuffer: 1024 * 1024 },
  );
  const demoRecord = JSON.parse(demoOutput);
  if (demoRecord.state !== "COMPLETED") throw new Error(`Installed package demo did not complete: ${demoRecord.state}`);
  console.log(JSON.stringify({ package: packResult.id, size: packResult.size, unpackedSize: packResult.unpackedSize, installedCli: versionOutput.trim(), demoState: demoRecord.state }));
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
