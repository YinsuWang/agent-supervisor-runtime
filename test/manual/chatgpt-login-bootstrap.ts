import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const profileDir = process.env.ASR_CHATGPT_SPIKE_PROFILE
  ?? join(homedir(), ".agent-supervisor-runtime", "chatgpt-spike-profile");
const chromeExecutable = process.env.ASR_CHROME_EXECUTABLE ?? findChromeExecutable();

console.log(`Ordinary Chrome executable: ${chromeExecutable}`);
console.log(`Dedicated profile: ${profileDir}`);
console.log("Complete the ChatGPT login manually, open a disposable conversation, then close every window belonging to this dedicated Chrome profile.");
console.log("This bootstrap does not use Playwright, remote debugging, browser automation, or the default Chrome profile.");

const chrome = spawn(
  chromeExecutable,
  [`--user-data-dir=${profileDir}`, "--new-window", "https://chatgpt.com/auth/login"],
  { stdio: "ignore", windowsHide: false },
);

chrome.once("error", (error) => {
  console.error(`Unable to start ordinary Chrome: ${error.message}`);
  process.exitCode = 1;
});

chrome.once("exit", (code, signal) => {
  if (signal) {
    console.error(`Ordinary Chrome exited from signal ${signal}.`);
    process.exitCode = 1;
    return;
  }
  console.log(`Ordinary Chrome closed (exit code ${code ?? "unknown"}).`);
  if (code !== 0) process.exitCode = 1;
});

function findChromeExecutable(): string {
  const candidates = [
    join(process.env.PROGRAMFILES ?? "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
    join(process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe"),
    join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "Google", "Chrome", "Application", "chrome.exe"),
  ];
  const match = candidates.find((candidate) => existsSync(candidate));
  if (!match) throw new Error("Chrome executable not found. Set ASR_CHROME_EXECUTABLE to an explicit path.");
  return match;
}
