import { access, mkdtemp, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const outputDirectory = resolve("dist", "native-host-release");
const artifact = process.platform === "win32"
  ? join(outputDirectory, "agent-supervisor-runtime-host.exe")
  : join(outputDirectory, "agent-supervisor-runtime-host.cjs");
await access(artifact, constants.F_OK);
const isolatedDirectory = await mkdtemp(join(tmpdir(), "asr-release-smoke-"));
try {
  const command = process.platform === "win32" ? artifact : process.execPath;
  const args = process.platform === "win32" ? ["--self-test"] : [artifact, "--self-test"];
  const { stdout } = await execFileAsync(command, args, {
    cwd: isolatedDirectory,
    windowsHide: true,
    timeout: 30_000,
  });
  const result = JSON.parse(stdout.trim());
  if (result.ok !== true || result.protocol !== "ASR-NM/1") throw new Error(`Unexpected native host result: ${stdout}`);
  console.log(JSON.stringify({ artifact, ...result }));
} finally {
  await rm(isolatedDirectory, { recursive: true, force: true });
}
