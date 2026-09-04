import { browserInstallCommand, type BrowserInstallOptions } from "./browser.js";

export type SetupCommandOptions = BrowserInstallOptions;

export async function setupCommand(options: SetupCommandOptions) {
  return browserInstallCommand(options);
}
