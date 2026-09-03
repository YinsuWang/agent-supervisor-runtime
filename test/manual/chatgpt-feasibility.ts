import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { chromium, type BrowserContext, type Page } from "playwright";

const profileDir = process.env.ASR_CHATGPT_SPIKE_PROFILE ?? join(homedir(), ".agent-supervisor-runtime", "chatgpt-spike-profile");
const startUrl = process.env.ASR_CHATGPT_CONVERSATION_URL ?? "https://chatgpt.com/";
const rl = createInterface({ input, output });

type Result = { criterion: string; status: "PASS" | "FAIL" | "MANUAL"; evidence: string };
const results: Result[] = [];

console.log(`Dedicated profile: ${profileDir}`);
console.log("This manual-only spike may send two harmless ASR feasibility messages to the conversation you choose.");
const consent = (await rl.question("Continue? [y/N] ")).trim().toLowerCase();
if (consent !== "y") process.exit(2);

let context = await launch();
let page = context.pages()[0] ?? await context.newPage();
await page.goto(startUrl);
console.log("Log in to ChatGPT if needed, open the disposable conversation to test, then return here.");
await rl.question("Press Enter when the conversation is ready... ");

const identity = conversationIdentity(page.url());
results.push({ criterion: "conversation identity", status: identity ? "PASS" : "FAIL", evidence: identity ?? "No /c/<id> URL" });

const composer = page.getByRole("textbox").last();
const composerAvailable = await composer.count() === 1 && await composer.isEditable().catch(() => false);
const send = page.getByRole("button", { name: /send/i }).last();
results.push({ criterion: "semantic composer", status: composerAvailable ? "PASS" : "FAIL", evidence: composerAvailable ? "editable textbox role found" : "editable textbox unavailable" });

if (composerAvailable) {
  const marker = `ASR feasibility probe ${new Date().toISOString()}`;
  await composer.fill(marker);
  const sendAvailable = await send.count() === 1;
  if (sendAvailable) await send.click();
  results.push({ criterion: "semantic submit", status: sendAvailable ? "PASS" : "FAIL", evidence: sendAvailable ? "textbox fill + semantic send button" : "send button unavailable" });

  const background = await context.newPage();
  await background.goto("about:blank");
  await background.bringToFront();
  const backgroundMarker = `${marker} background`;
  let backgroundSend = false;
  try {
    await composer.fill(backgroundMarker);
    if (await send.count() === 1) {
      await send.click();
      backgroundSend = true;
    }
  } catch {}
  results.push({ criterion: "background tab send/observe", status: backgroundSend ? "PASS" : "FAIL", evidence: backgroundSend ? "semantic send succeeded while another tab was foreground" : "background semantic send failed" });
  await page.bringToFront();
}

const stop = page.getByRole("button", { name: /stop/i }).last();
const assistantNodes = page.locator('[data-message-author-role="assistant"], article').filter({ hasNot: page.locator('[data-message-author-role="user"]') });
const generationAnchor = await stop.count() > 0;
results.push({ criterion: "streaming completion detection", status: generationAnchor ? "PASS" : "FAIL", evidence: generationAnchor ? "semantic stop-generation control observed" : "no semantic generation control observed" });
const assistantReadable = await assistantNodes.count() > 0 && ((await assistantNodes.last().textContent())?.trim().length ?? 0) > 0;
results.push({ criterion: "assistant response readable", status: assistantReadable ? "PASS" : "FAIL", evidence: assistantReadable ? "assistant content readable from DOM" : "assistant content not found" });

const boundUrl = identity ? `https://chatgpt.com/c/${identity}` : page.url();
await context.close();
context = await launch();
page = context.pages()[0] ?? await context.newPage();
await page.goto(boundUrl);
const loginPersisted = page.url().includes("chatgpt.com") && await page.getByRole("textbox").count() > 0;
results.push({ criterion: "persistent manual login", status: loginPersisted ? "PASS" : "FAIL", evidence: loginPersisted ? "dedicated profile reopened with conversation UI available" : "login/session not reusable" });

console.log("Open the same conversation in ChatGPT Desktop and confirm the probe messages are visible there.");
const desktop = (await rl.question("Visible in Desktop? [y/N] ")).trim().toLowerCase() === "y";
results.push({ criterion: "Desktop/Web same conversation", status: desktop ? "PASS" : "FAIL", evidence: desktop ? "operator confirmed same cloud conversation" : "not confirmed" });

console.log("\nASR ChatGPT feasibility results:");
console.table(results);
console.log(JSON.stringify({ profileDir, conversationId: identity, results }, null, 2));

await context.close();
rl.close();
process.exitCode = results.every((result) => result.status === "PASS") ? 0 : 1;

function launch(): Promise<BrowserContext> {
  return chromium.launchPersistentContext(profileDir, { channel: "chrome", headless: false });
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
