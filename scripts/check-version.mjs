import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const packageLock = JSON.parse(await readFile(resolve(root, "package-lock.json"), "utf8"));
const manifest = JSON.parse(await readFile(resolve(root, "extension", "manifest.json"), "utf8"));
const versionSource = await readFile(resolve(root, "src", "version.ts"), "utf8");
const sourceMatch = versionSource.match(/ASR_VERSION\s*=\s*(["'])([^"']+)\1/u);
const versions = {
  package: packageJson.version,
  lock: packageLock.packages?.[""]?.version,
  manifest: manifest.version,
  runtime: sourceMatch?.[2],
};
const uniqueVersions = new Set(Object.values(versions));
if (uniqueVersions.size !== 1 || [...uniqueVersions][0] === undefined) {
  throw new Error(`Version mismatch: ${JSON.stringify(versions)}`);
}
if (!/^\d+(?:\.\d+){0,3}$/u.test(String(versions.package))) {
  throw new Error(`Package version is not Chrome-compatible: ${String(versions.package)}`);
}
console.log(`Version consistency check passed: ${versions.package}`);
