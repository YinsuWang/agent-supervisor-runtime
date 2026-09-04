import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { build } from "esbuild";

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = join(root, "dist", "native-host-release");
const bundlePath = join(outputDirectory, "agent-supervisor-runtime-host.cjs");
await mkdir(outputDirectory, { recursive: true });
await build({
  entryPoints: [join(root, "src", "native-host", "index.ts")],
  outfile: bundlePath,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  sourcemap: false,
  minify: false,
  logLevel: "info",
});

if (process.platform === "win32") {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "asr-sea-"));
  try {
    const blobPath = join(temporaryDirectory, "agent-supervisor-runtime-host.blob");
    const configPath = join(temporaryDirectory, "sea-config.json");
    const executablePath = join(outputDirectory, "agent-supervisor-runtime-host.exe");
    await writeFile(configPath, `${JSON.stringify({
      main: bundlePath,
      output: blobPath,
      disableExperimentalSEAWarning: true,
      useSnapshot: false,
      useCodeCache: false,
    }, null, 2)}\n`, "utf8");
    await execFileAsync(process.execPath, ["--experimental-sea-config", configPath], { cwd: root });
    await copyFile(process.execPath, executablePath);
    await execFileAsync(process.execPath, [
      join(root, "node_modules", "postject", "dist", "cli.js"),
      executablePath,
      "NODE_SEA_BLOB",
      blobPath,
      "--sentinel-fuse",
      "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
    ], { cwd: root });
    console.log(`Windows native host: ${executablePath}`);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
} else {
  console.log(`Portable native host bundle: ${bundlePath}`);
}
