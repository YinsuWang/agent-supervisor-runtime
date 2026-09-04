import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { defaultRuntimeHome } from "../runtime/daemon.js";

export type CompanionProfileOptions = {
  runtimeHome?: string;
  projectStateDirectory?: string;
  defaultChromeProfileDirectories?: readonly string[];
};

export function companionProfileDirectory(options: CompanionProfileOptions = {}): string {
  const runtimeHome = resolve(options.runtimeHome ?? defaultRuntimeHome());
  const profileDir = resolve(runtimeHome, "companion", "chrome-profile");
  assertCompanionProfileDirectory(profileDir, options);
  return profileDir;
}

export function assertCompanionProfileDirectory(profileDirectory: string, options: Omit<CompanionProfileOptions, "runtimeHome"> = {}): string {
  const profileDir = resolve(profileDirectory);
  const projectState = resolve(options.projectStateDirectory ?? ".orchestrator");
  if (isWithin(profileDir, projectState)) {
    throw new Error("Companion profile must remain outside project state");
  }
  for (const chromeProfile of options.defaultChromeProfileDirectories ?? defaultChromeProfileDirectories()) {
    if (isWithin(profileDir, resolve(chromeProfile)) || isWithin(resolve(chromeProfile), profileDir)) {
      throw new Error("Companion profile must not reuse the default Chrome profile");
    }
  }
  return profileDir;
}

export function defaultChromeProfileDirectories(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string[] {
  if (platform === "win32") {
    return [join(env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "Google", "Chrome", "User Data")];
  }
  if (platform === "darwin") return [join(homedir(), "Library", "Application Support", "Google", "Chrome")];
  return [join(homedir(), ".config", "google-chrome"), join(homedir(), ".config", "chromium")];
}

function isWithin(candidate: string, parent: string): boolean {
  const child = relative(parent, candidate);
  return child === "" || (!child.startsWith("..") && !isAbsolute(child));
}
