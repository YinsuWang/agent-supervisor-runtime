import { createRequire } from "node:module";
import { homedir, release as osRelease } from "node:os";
import { dirname, join } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium, type BrowserContext, type Page } from "playwright";
import { PlaywrightChatGptPageDriver } from "../../src/page-driver/playwright-backend.js";
import type { GenerationState, PageCompatibility, PageConversationIdentity, PageMessage, SubmitReceipt } from "../../src/page-driver/contracts.js";
import { CHATGPT_WEB_COMPATIBILITY_PROFILE, conversationIdentityFromPageUrl } from "../../src/page-driver/profile.js";

const profileDir = process.env.ASR_CHATGPT_SPIKE_PROFILE
  ?? join(homedir(), ".agent-supervisor-runtime", "chatgpt-spike-profile");
const startUrl = process.env.ASR_CHATGPT_CONVERSATION_URL ?? "https://chatgpt.com/";
const timeoutMs = 120_000;
const rl = createInterface({ input, output });
const require = createRequire(import.meta.url);
const playwrightVersion = (require("playwright/package.json") as { version: string }).version;
let context: BrowserContext | undefined;

try {
  console.log(`Dedicated profile: ${profileDir}`);
  console.log("This manual-only smoke sends one fixed ASR page-driver message and records no conversation content or credentials.");
  if ((await rl.question("Continue? [y/N] ")).trim().toLowerCase() !== "y") process.exit(2);

  context = await chromium.launchPersistentContext(profileDir, { channel: "chrome", headless: false });
  const launchPage = context.pages()[0] ?? await context.newPage();
  await launchPage.goto(startUrl, { waitUntil: "domcontentloaded" });
  console.log("Open the regular disposable ChatGPT conversation, then return here.");
  await rl.question("Press Enter when its /c/<id> page is ready... ");

  const page = findSingleConversationPage(context);
  const playwrightDriver = new PlaywrightChatGptPageDriver(page);
  const identity = await playwrightDriver.inspectConversation();
  const playwrightHealth = await playwrightDriver.health();
  if (playwrightHealth.status !== "COMPATIBLE") {
    console.log("Sanitized semantic controls:", JSON.stringify(await collectSemanticDiagnostics(page), null, 2));
  }
  assertCompatible("Playwright", playwrightHealth);

  const bundle = await build({
    entryPoints: [join(dirname(fileURLToPath(import.meta.url)), "../../src/page-driver/extension-backend.ts")],
    bundle: true,
    format: "iife",
    globalName: "AsrPageDriver",
    footer: { js: "globalThis.AsrPageDriver = AsrPageDriver;" },
    platform: "browser",
    write: false,
  });
  await page.addInitScript({ content: bundle.outputFiles[0]!.text });
  await page.reload({ waitUntil: "domcontentloaded" });
  const reloadedIdentity = await playwrightDriver.inspectConversation();
  if (reloadedIdentity.conversationId !== identity.conversationId) throw new Error("Conversation identity changed during extension smoke reload");
  await waitForEditableComposer(page);

  const marker = `ASR_PAGE_DRIVER_SMOKE_${new Date().toISOString().replace(/[^0-9]/g, "")}`;
  const extensionResult = await runExtensionBackend(page, identity.conversationId, marker);
  assertCompatible("Extension", extensionResult.health);
  if (extensionResult.identity.conversationId !== identity.conversationId) throw new Error("Extension and Playwright identity disagree");
  if (!extensionResult.receipt.messageId) throw new Error("Extension backend returned no submit receipt");

  await waitForLifecycle(playwrightDriver, page);
  await waitForCorrelatedAssistant(playwrightDriver, page, marker);

  console.log("PASS: production extension and Playwright page drivers completed the live semantic smoke.");
  console.log(JSON.stringify({
    chromeVersion: context.browser()?.version() ?? "unavailable",
    playwrightVersion,
    nodeVersion: process.version,
    windowsRelease: osRelease(),
    identityMatched: true,
    playwrightCompatibility: "COMPATIBLE",
    extensionCompatibility: "COMPATIBLE",
    semanticSubmitObserved: true,
    generationLifecycleObserved: true,
    correlatedAssistantObserved: true,
  }, null, 2));
} catch (error) {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await context?.close().catch(() => undefined);
  rl.close();
}

async function waitForEditableComposer(page: Page): Promise<void> {
  const candidates = page.locator(CHATGPT_WEB_COMPATIBILITY_PROFILE.composerSelectors.join(", "));
  await candidates.last().waitFor({ state: "visible", timeout: 30_000 });
  const editable = await candidates.last().isEditable().catch(() => false);
  if (!editable) throw new Error("ChatGPT composer rendered but is not editable after reload");
}

async function collectSemanticDiagnostics(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const composer = document.querySelector<HTMLElement>('#prompt-textarea, [role="textbox"][contenteditable="true"]');
    const scope = composer?.closest("form") ?? composer?.parentElement?.parentElement;
    return ({
    editors: composer ? [composer].map((element) => ({
      tag: element.tagName.toLowerCase(),
      id: element.id || undefined,
      role: element.getAttribute("role") || undefined,
      ariaLabel: element.getAttribute("aria-label") || undefined,
      dataTestId: element.getAttribute("data-testid") || undefined,
      visible: element.getClientRects().length > 0,
    })) : [],
    buttons: Array.from(scope?.querySelectorAll<HTMLButtonElement>("button") ?? []).map((button) => ({
      id: button.id || undefined,
      ariaLabel: button.getAttribute("aria-label") || undefined,
      title: button.getAttribute("title") || undefined,
      dataTestId: button.dataset.testid || undefined,
      disabled: button.disabled,
      visible: button.getClientRects().length > 0,
    })),
  });
  });
}

function findSingleConversationPage(browserContext: BrowserContext): Page {
  const conversationPages = browserContext.pages().filter((candidate) => {
    try {
      conversationIdentityFromPageUrl(candidate.url());
      return true;
    } catch {
      return false;
    }
  });
  if (conversationPages.length !== 1) {
    throw new Error(`Expected exactly one /c/<id> page, found ${conversationPages.length}; close extra conversation tabs and retry`);
  }
  return conversationPages[0]!;
}

async function runExtensionBackend(
  page: Page,
  expectedConversationId: string,
  marker: string,
): Promise<{ health: PageCompatibility; identity: PageConversationIdentity; receipt: SubmitReceipt }> {
  return page.evaluate(async ({ expected, probe }) => {
    const api = (window as unknown as {
      AsrPageDriver: {
        ExtensionChatGptPageDriver: new (options: { expectedConversationId: string }) => {
          health(): Promise<PageCompatibility>;
          inspectConversation(): Promise<PageConversationIdentity>;
          submitMessage(message: string): Promise<SubmitReceipt>;
        };
      };
    }).AsrPageDriver;
    const driver = new api.ExtensionChatGptPageDriver({ expectedConversationId: expected });
    const identity = await driver.inspectConversation();
    const preflight = await driver.health();
    const blocking = preflight.missing.filter((capability) => capability === "conversationIdentity" || capability === "composer" || capability === "submit");
    if (blocking.length) throw new Error(`Extension preflight is INCOMPATIBLE: ${blocking.join(", ")}`);
    const receipt = await driver.submitMessage(`${probe} — Return a numbered list from 1 to 60, then finish with ASR_PAGE_DRIVER_COMPLETE.`);
    const health = await driver.health();
    return { health, identity, receipt };
  }, { expected: expectedConversationId, probe: marker });
}

function assertCompatible(label: string, health: PageCompatibility): void {
  if (health.status !== "COMPATIBLE") throw new Error(`${label} backend is INCOMPATIBLE: ${health.missing.join(", ")}`);
}

async function waitForLifecycle(
  driver: PlaywrightChatGptPageDriver,
  page: Page,
): Promise<void> {
  await waitForState(driver, page, "GENERATING", 30_000);
  await waitForState(driver, page, "IDLE", timeoutMs);
}

async function waitForState(
  driver: PlaywrightChatGptPageDriver,
  page: Page,
  expected: GenerationState,
  timeout: number,
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const current = await driver.detectGenerationState();
    if (current === expected) return;
    if (current === "ERROR" || current === "INTERRUPTED") throw new Error(`Generation entered ${current} before ${expected}`);
    await page.waitForTimeout(100);
  }
  throw new Error(`Generation state ${expected} was not observed`);
}

async function waitForCorrelatedAssistant(
  driver: PlaywrightChatGptPageDriver,
  page: Page,
  marker: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const messages: PageMessage[] = [];
    for await (const message of driver.observeMessages()) messages.push(message);
    const requestIndex = messages.findIndex((message) => message.role === "user" && message.content.includes(marker));
    if (requestIndex >= 0 && messages.slice(requestIndex + 1).some((message) => message.role === "assistant" && message.content.trim())) return;
    await page.waitForTimeout(100);
  }
  throw new Error("Correlated assistant response was not observed");
}
