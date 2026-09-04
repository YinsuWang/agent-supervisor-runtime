import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { browserInstallCommand, browserUninstallCommand } from "../../src/cli/commands/browser.js";
import { UserServiceManager, windowsCommandLine } from "../../src/setup/service.js";
import { WindowsRegistry, type CommandExecution, type CommandExecutor } from "../../src/setup/windows-registry.js";

class FakeExecutor implements CommandExecutor {
  readonly calls: Array<{ file: string; args: readonly string[] }> = [];
  failQuery = false;

  async exec(file: string, args: readonly string[]): Promise<CommandExecution> {
    this.calls.push({ file, args: [...args] });
    if (this.failQuery && args[0] === "QUERY") throw new Error("missing");
    if (args[0] === "QUERY" && args.includes("/ve")) {
      return { stdout: `${args[1]}\n    (Default)    REG_SZ    C:\\ASR Runtime\\host.json\n`, stderr: "" };
    }
    return { stdout: "", stderr: "" };
  }
}

const tempDirs: string[] = [];
afterEach(async () => Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))));

describe("Windows current-user setup", () => {
  it("registers the native host under HKCU and supports dry-run without side effects", async () => {
    const runtimeHome = await mkdtemp(join(tmpdir(), "asr-setup-"));
    tempDirs.push(runtimeHome);
    const executor = new FakeExecutor();
    const registry = new WindowsRegistry(executor);

    const dry = await browserInstallCommand({
      runtimeHome,
      hostPath: "C:\\ASR\\host.exe",
      extensionId: "abcdefghijklmnopabcdefghijklmnop",
      dryRun: true,
      registry,
    });
    expect(executor.calls).toHaveLength(0);
    await expect(readFile(dry.manifestPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(dry.registryOperation.args[1]).toBe("HKCU\\SOFTWARE\\Google\\Chrome\\NativeMessagingHosts\\com.agent_supervisor_runtime");

    const installed = await browserInstallCommand({
      runtimeHome,
      hostPath: "C:\\ASR\\host.exe",
      extensionId: "abcdefghijklmnopabcdefghijklmnop",
      registry,
    });
    expect(JSON.parse(await readFile(installed.manifestPath, "utf8"))).toEqual(installed.manifest);
    expect(executor.calls[0]).toMatchObject({ file: "reg.exe" });
    expect(executor.calls[0]!.args[0]).toBe("ADD");

    await browserUninstallCommand({ runtimeHome, registry });
    expect(executor.calls[1]!.args[0]).toBe("DELETE");
    await expect(readFile(installed.manifestPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("manages optional login startup with HKCU Run and remains reversible", async () => {
    const executor = new FakeExecutor();
    const manager = new UserServiceManager(executor);
    const command = windowsCommandLine("C:\\Program Files\\nodejs\\node.exe", ["C:\\ASR Runtime\\cli.js", "daemon"]);

    const enabled = await manager.enable(command);
    expect(enabled.args).toContain("HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run");
    expect(enabled.args).toContain("AgentSupervisorRuntime");
    expect(await manager.status()).toBe(true);

    await manager.disable();
    expect(executor.calls.at(-1)?.args[0]).toBe("DELETE");

    executor.failQuery = true;
    expect(await manager.status()).toBe(false);
  });

  it("reads the exact current-user native host manifest registration", async () => {
    const registry = new WindowsRegistry(new FakeExecutor());
    await expect(registry.nativeHostManifestPath("com.agent_supervisor_runtime"))
      .resolves.toBe("C:\\ASR Runtime\\host.json");
  });
});
