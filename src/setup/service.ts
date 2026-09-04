import type { CommandExecutor, RegistryOperation } from "./windows-registry.js";
import { NodeCommandExecutor } from "./windows-registry.js";

const RUN_KEY = "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run";
const VALUE_NAME = "AgentSupervisorRuntime";

export class UserServiceManager {
  constructor(private readonly executor: CommandExecutor = new NodeCommandExecutor()) {}

  async enable(commandLine: string, dryRun = false): Promise<RegistryOperation> {
    const operation: RegistryOperation = {
      file: "reg.exe",
      args: ["ADD", RUN_KEY, "/v", VALUE_NAME, "/t", "REG_SZ", "/d", commandLine, "/f"],
    };
    if (!dryRun) await this.executor.exec(operation.file, operation.args);
    return operation;
  }

  async disable(dryRun = false): Promise<RegistryOperation> {
    const operation: RegistryOperation = {
      file: "reg.exe",
      args: ["DELETE", RUN_KEY, "/v", VALUE_NAME, "/f"],
    };
    if (!dryRun) await this.executor.exec(operation.file, operation.args);
    return operation;
  }

  async status(): Promise<boolean> {
    try {
      await this.executor.exec("reg.exe", ["QUERY", RUN_KEY, "/v", VALUE_NAME]);
      return true;
    } catch {
      return false;
    }
  }
}

export function windowsCommandLine(executable: string, args: readonly string[]): string {
  return [executable, ...args].map(quoteWindowsArg).join(" ");
}

function quoteWindowsArg(value: string): string {
  if (!/[\s"]/u.test(value)) return value;
  return `"${value.replace(/(\\*)"/g, "$1$1\\\"").replace(/(\\+)$/g, "$1$1")}"`;
}
