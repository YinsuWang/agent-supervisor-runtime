import { copyFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

if (process.platform !== "win32") throw new Error("Release staging requires Windows to build the SEA executable");

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const releaseDirectory = resolve(root, process.env.ASR_RELEASE_DIR ?? "release");
const hostSource = resolve(root, "dist", "native-host-release", "agent-supervisor-runtime-host.exe");
const hostName = `agent-supervisor-runtime-host-v${packageJson.version}-win-x64.exe`;
const bundledNpmCli = resolve(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
const npmCli = process.env.npm_execpath ?? (existsSync(bundledNpmCli) ? bundledNpmCli : undefined);
const npm = npmCli ? process.execPath : "npm";

await mkdir(releaseDirectory, { recursive: true });
await copyFile(hostSource, join(releaseDirectory, hostName));
const npmArgs = npmCli ? [npmCli, "pack", "--json", "--pack-destination", releaseDirectory] : ["pack", "--json", "--pack-destination", releaseDirectory];
const { stdout } = await execFileAsync(npm, npmArgs, { cwd: root });
const packageResult = JSON.parse(stdout.trim()).at(-1);
console.log(JSON.stringify({ directory: releaseDirectory, host: hostName, npmPackage: packageResult?.filename }, null, 2));
