import { UserServiceManager, windowsCommandLine } from "../../setup/service.js";

export async function serviceEnableCommand(input: {
  runtimeHome: string;
  cliPath: string;
  nodePath?: string;
  dryRun?: boolean;
  manager?: UserServiceManager;
}) {
  const commandLine = windowsCommandLine(input.nodePath ?? process.execPath, [input.cliPath, "daemon", "--runtime-home", input.runtimeHome]);
  return (input.manager ?? new UserServiceManager()).enable(commandLine, input.dryRun ?? false);
}

export async function serviceDisableCommand(input: { dryRun?: boolean; manager?: UserServiceManager }) {
  return (input.manager ?? new UserServiceManager()).disable(input.dryRun ?? false);
}

export async function serviceStatusCommand(input: { manager?: UserServiceManager }) {
  return (input.manager ?? new UserServiceManager()).status();
}
