import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type CommandExecution = { stdout: string; stderr: string };

export interface CommandExecutor {
  exec(file: string, args: readonly string[]): Promise<CommandExecution>;
}

export class NodeCommandExecutor implements CommandExecutor {
  async exec(file: string, args: readonly string[]): Promise<CommandExecution> {
    const result = await execFileAsync(file, [...args], { windowsHide: true });
    return { stdout: result.stdout, stderr: result.stderr };
  }
}

export type RegistryOperation = {
  file: "reg.exe";
  args: string[];
};

export class WindowsRegistry {
  constructor(private readonly executor: CommandExecutor = new NodeCommandExecutor()) {}

  nativeHostKey(name: string): string {
    return `HKCU\\SOFTWARE\\Google\\Chrome\\NativeMessagingHosts\\${name}`;
  }

  async installNativeHost(name: string, manifestPath: string, dryRun = false): Promise<RegistryOperation> {
    const operation: RegistryOperation = {
      file: "reg.exe",
      args: ["ADD", this.nativeHostKey(name), "/ve", "/t", "REG_SZ", "/d", manifestPath, "/f"],
    };
    if (!dryRun) await this.executor.exec(operation.file, operation.args);
    return operation;
  }

  async uninstallNativeHost(name: string, dryRun = false): Promise<RegistryOperation> {
    const operation: RegistryOperation = {
      file: "reg.exe",
      args: ["DELETE", this.nativeHostKey(name), "/f"],
    };
    if (!dryRun) await this.executor.exec(operation.file, operation.args);
    return operation;
  }
}
