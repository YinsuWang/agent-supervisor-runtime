import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createNativeHostManifest, type NativeHostManifest } from "../../setup/native-host-manifest.js";
import { WindowsRegistry, type RegistryOperation } from "../../setup/windows-registry.js";

export type BrowserInstallOptions = {
  runtimeHome: string;
  hostPath: string;
  extensionId: string;
  hostName?: string;
  dryRun?: boolean;
  registry?: WindowsRegistry;
};

export type BrowserInstallResult = {
  manifest: NativeHostManifest;
  manifestPath: string;
  registryOperation: RegistryOperation;
};

export async function browserInstallCommand(options: BrowserInstallOptions): Promise<BrowserInstallResult> {
  const manifest = createNativeHostManifest({
    name: options.hostName,
    path: options.hostPath,
    extensionId: options.extensionId,
  });
  const manifestDir = join(options.runtimeHome, "native-host");
  const manifestPath = join(manifestDir, `${manifest.name}.json`);
  if (!options.dryRun) {
    await mkdir(manifestDir, { recursive: true });
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }
  const registryOperation = await (options.registry ?? new WindowsRegistry())
    .installNativeHost(manifest.name, manifestPath, options.dryRun ?? false);
  return { manifest, manifestPath, registryOperation };
}

export async function browserUninstallCommand(options: {
  runtimeHome: string;
  hostName?: string;
  dryRun?: boolean;
  registry?: WindowsRegistry;
}): Promise<RegistryOperation> {
  const hostName = options.hostName ?? "com.agent_supervisor_runtime";
  const operation = await (options.registry ?? new WindowsRegistry())
    .uninstallNativeHost(hostName, options.dryRun ?? false);
  if (!options.dryRun) await rm(join(options.runtimeHome, "native-host", `${hostName}.json`), { force: true });
  return operation;
}
