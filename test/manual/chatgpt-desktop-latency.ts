import { homedir, release as osRelease } from "node:os";
import { join } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { chromium, type BrowserContext, type Locator, type Page } from "playwright";

const profileDir = process.env.ASR_CHATGPT_SPIKE_PROFILE ?? join(homedir(), ".agent-supervisor-runtime", "chatgpt-spike-profile");
const startUrl = process.env.ASR_CHATGPT_CONVERSATION_URL ?? "https://chatgpt.com/";
const pollIntervalMs = 5_000;
const maxObservationMs = 120_000;
const probeTimeoutMs = 120_000;
const rl = createInterface({ input, output });
let context: BrowserContext | undefined;

try {
  console.log(`Dedicated profile: ${profileDir}`);
  console.log("This manual-only smoke sends one fixed, harmless probe and records only timing metadata.");
  if ((await rl.question("Continue? [y/N] ")).trim().toLowerCase() !== "y") process.exit(2);

  context = await chromium.launchPersistentContext(profileDir, { channel: "chrome", headless: false });
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto(startUrl, { waitUntil: "domcontentloaded" });
  console.log("Log in manually if needed, open the disposable bound conversation in Web and the same conversation in Desktop.");
  await rl.question("Press Enter when the Web page is on its /c/<id> conversation... ");

  const identity = conversationIdentity(page.url());
  if (!identity) throw new Error("The selected Web page does not have a chatgpt.com /c/<id> identity.");
  const marker = `ASR_DESKTOP_LATENCY_${new Date().toISOString().replace(/[^0-9]/g, "")}`;
  const assistantObserved = await submitAndObserve(page, marker);
  if (!assistantObserved) throw new Error("The Web assistant response was not observed after the probe.");

  const webObservedAt = new Date().toISOString();
  console.log(`Web probe observed at ${webObservedAt}. Keep Desktop on the same conversation.`);
  const desktop = await measureDesktopWindow();
  const result = {
    environment: {
      chromeVersion: context.browser()?.version() ?? "unavailable",
      nodeVersion: process.version,
      windowsRelease: osRelease(),
    },
    webProbe: { submitted: true, assistantObserved: true },
    desktop,
  };
  console.log("\nASR Desktop synchronization latency result:");
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = desktop.visible ? 0 : 1;
} catch (error) {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await context?.close().catch(() => undefined);
  rl.close();
}

async function measureDesktopWindow(): Promise<{
  visible: boolean;
  firstVisibleAfterMs?: number;
  confirmationReceivedAfterMs?: number;
  observationWindowMs: number;
  requiredReopen: boolean;
  visibleAfterReopen?: boolean;
  visibleAfterReopenMs?: number;
}> {
  const startedAt = Date.now();
  let nextCheckpointMs = pollIntervalMs;
  while (Date.now() - startedAt < maxObservationMs) {
    await delay(Math.max(0, nextCheckpointMs - (Date.now() - startedAt)));
    const checkpointAt = Date.now() - startedAt;
    const answer = (await rl.question(`Desktop checkpoint +${checkpointAt} ms: are both probe messages visible? [y/N] `)).trim().toLowerCase();
    if (answer === "y") {
      return {
        visible: true,
        firstVisibleAfterMs: checkpointAt,
        confirmationReceivedAfterMs: Date.now() - startedAt,
        observationWindowMs: maxObservationMs,
        requiredReopen: false,
      };
    }
    nextCheckpointMs += pollIntervalMs;
  }

  console.log("The bounded window ended without Desktop visibility. Reopen the exact Desktop conversation now.");
  const reopenStartedAt = Date.now();
  await rl.question("Press Enter after reopening Desktop... ");
  const visibleAfterReopen = (await rl.question("Are both probe messages visible after reopen? [y/N] ")).trim().toLowerCase() === "y";
  return {
    visible: visibleAfterReopen,
    observationWindowMs: maxObservationMs,
    requiredReopen: true,
    visibleAfterReopen,
    visibleAfterReopenMs: visibleAfterReopen ? Date.now() - reopenStartedAt : undefined,
  };
}

async function submitAndObserve(page: Page, marker: string): Promise<boolean> {
  const composer = await findEditableTextbox(page);
  if (!composer) throw new Error("No editable ChatGPT composer was found.");
  await composer.fill(`${marker} — Reply with ASR_DESKTOP_LATENCY_COMPLETE.`);
  const sendButton = await findSendButton(page);
  if (!sendButton) throw new Error("No semantic ChatGPT Send button was found.");
  await sendButton.click();
  await waitForMessage(page, marker, "user");
  await waitForCorrelatedAssistant(page, marker);
  return true;
}

async function findEditableTextbox(page: Page): Promise<Locator | undefined> {
  const textboxes = page.getByRole("textbox");
  for (let index = (await textboxes.count()) - 1; index >= 0; index -= 1) {
    const candidate = textboxes.nth(index);
    if (await candidate.isVisible().catch(() => false) && await candidate.isEditable().catch(() => false)) return candidate;
  }
  return undefined;
}

async function findSendButton(page: Page): Promise<Locator | undefined> {
  const buttons = page.getByRole("button", { name: /send|发送/i });
  for (let index = (await buttons.count()) - 1; index >= 0; index -= 1) {
    const candidate = buttons.nth(index);
    if (await candidate.isVisible().catch(() => false) && await candidate.isEnabled().catch(() => false)) return candidate;
  }
  return undefined;
}

async function waitForMessage(page: Page, marker: string, role: "user" | "assistant"): Promise<void> {
  await page.waitForFunction(
    ({ expectedMarker, expectedRole }) => [...document.querySelectorAll<HTMLElement>(`[data-message-author-role="${expectedRole}"]`)]
      .some((node) => node.innerText.includes(expectedMarker)),
    { expectedMarker: marker, expectedRole: role },
    { timeout: probeTimeoutMs },
  );
}

async function waitForCorrelatedAssistant(page: Page, marker: string): Promise<void> {
  await page.waitForFunction(
    (expectedMarker) => {
      const messages = [...document.querySelectorAll<HTMLElement>("[data-message-author-role]")];
      const userIndex = messages.findIndex((node) => node.dataset.messageAuthorRole === "user" && node.innerText.includes(expectedMarker));
      return userIndex >= 0 && messages.slice(userIndex + 1)
        .some((node) => node.dataset.messageAuthorRole === "assistant" && node.innerText.trim().length > 0);
    },
    marker,
    { timeout: probeTimeoutMs },
  );
}

function conversationIdentity(urlValue: string): string | undefined {
  try {
    const url = new URL(urlValue);
    if (url.origin !== "https://chatgpt.com") return undefined;
    return /^\/c\/([^/?#]+)/u.exec(url.pathname)?.[1];
  } catch {
    return undefined;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
