import { homedir } from "node:os";
import { join } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { chromium, type BrowserContext, type Page } from "playwright";

const profileDir = process.env.ASR_CHATGPT_SPIKE_PROFILE
  ?? join(homedir(), ".agent-supervisor-runtime", "chatgpt-spike-profile");
const timeoutMs = 120_000;
const rl = createInterface({ input, output });
let context: BrowserContext | undefined;

try {
  console.log(`Dedicated profile: ${profileDir}`);
  console.log("This check sends no messages and records no conversation content or credentials.");
  context = await launch();
  let page = context.pages()[0] ?? await context.newPage();
  await page.goto("https://chatgpt.com/", { waitUntil: "domcontentloaded" });
  await waitForComposer(page);
  console.log("Open the regular disposable conversation used for the spike, then return here.");
  await rl.question("Press Enter when its /c/<id> page is open... ");

  const identity = conversationIdentity(page.url());
  if (!identity) throw new Error("The selected page does not have a chatgpt.com /c/<id> identity.");
  const boundUrl = `https://chatgpt.com/c/${identity}`;

  await context.close();
  context = await launch();
  page = context.pages()[0] ?? await context.newPage();
  await page.goto(boundUrl, { waitUntil: "domcontentloaded" });
  await waitForComposer(page);
  const reopenedIdentity = conversationIdentity(page.url());

  if (reopenedIdentity !== identity) throw new Error("The reopened page did not preserve the bound conversation identity.");
  console.log("PASS: the Playwright persistent profile reopened the same authenticated conversation without another login.");
} catch (error) {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await context?.close().catch(() => undefined);
  rl.close();
}

function launch(): Promise<BrowserContext> {
  return chromium.launchPersistentContext(profileDir, { channel: "chrome", headless: false });
}

async function waitForComposer(page: Page): Promise<void> {
  await page.waitForFunction(
    () => [...document.querySelectorAll<HTMLElement>('[role="textbox"], textarea, [contenteditable="true"]')]
      .some((element) => element.getClientRects().length > 0 && !element.hasAttribute("disabled")),
    undefined,
    { timeout: timeoutMs },
  );
}

function conversationIdentity(urlValue: string): string | undefined {
  try {
    const url = new URL(urlValue);
    if (url.origin !== "https://chatgpt.com") return undefined;
    return /^\/c\/([^/?#]+)/.exec(url.pathname)?.[1];
  } catch {
    return undefined;
  }
}
