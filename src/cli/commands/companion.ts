import { companionLogin, companionReset } from "../../companion/login.js";

export async function companionLoginCommand(options: { runtimeHome: string; chromeExecutable?: string }): Promise<{ profileDir: string }> {
  return companionLogin({ runtimeHome: options.runtimeHome, chromeExecutable: options.chromeExecutable });
}

export async function companionResetCommand(options: { runtimeHome: string }): Promise<{ profileDir: string; removed: true }> {
  return companionReset({ runtimeHome: options.runtimeHome });
}
