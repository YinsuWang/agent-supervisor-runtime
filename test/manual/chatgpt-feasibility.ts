import { createRequire } from "node:module";
import { homedir, release as osRelease } from "node:os";
import { join } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { chromium, type BrowserContext, type Locator, type Page } from "playwright";

const profileDir = process.env.ASR_CHATGPT_SPIKE_PROFILE ?? join(homedir(), ".agent-supervisor-runtime", "chatgpt-spike-profile");
const startUrl = process.env.ASR_CHATGPT_CONVERSATION_URL ?? "https://chatgpt.com/";
const probeTimeoutMs = 120_000;
const rl = createInterface({ input, output });
const require = createRequire(import.meta.url);
const playwrightVersion = (require("playwright/package.json") as { version: string }).version;

type Result = { criterion: string; status: "PASS" | "FAIL"; evidence: string };
type ProbeObservation = {
  userObserved: boolean;
  assistantObserved: boolean;
  generationStarted: boolean;
  generationCompleted: boolean;
};

const results: Result[] = [];
let context: BrowserContext | undefined;

try {
  console.log(`Dedicated profile: ${profileDir}`);
  console.log("This manual-only spike sends two fixed, harmless ASR feasibility probes to the disposable conversation you choose.");
  const consent = (await rl.question("Continue? [y/N] ")).trim().toLowerCase();
  if (consent !== "y") process.exit(2);

  context = await launch();
  let page = context.pages()[0] ?? await context.newPage();
  await page.goto(startUrl, { waitUntil: "domcontentloaded" });
  console.log("Log in to ChatGPT if needed, open a disposable conversation, then return here.");
  await rl.question("Press Enter when the conversation is ready... ");

  let identity = conversationIdentity(page.url());

  const composer = await findEditableTextbox(page);
  results.push({
    criterion: "semantic composer",
    status: composer ? "PASS" : "FAIL",
    evidence: composer ? "visible editable textbox role found" : "visible editable textbox role unavailable",
  });

  if (composer) {
    const marker = probeMarker("STREAM");
    const foregroundObservation = await submitAndObserve(page, marker, true);
    identity ??= await waitForConversationIdentity(page);
    results.push({
      criterion: "semantic submit",
      status: foregroundObservation.userObserved ? "PASS" : "FAIL",
      evidence: foregroundObservation.userObserved
        ? "textbox fill + semantic send button + matching user message observed"
        : "matching submitted user message was not observed",
    });
    results.push({
      criterion: "streaming completion detection",
      status: foregroundObservation.generationStarted && foregroundObservation.generationCompleted ? "PASS" : "FAIL",
      evidence: foregroundObservation.generationStarted && foregroundObservation.generationCompleted
        ? "visible semantic stop-generation state appeared, disappeared, and correlated assistant content stabilized"
        : `started=${foregroundObservation.generationStarted}, completed=${foregroundObservation.generationCompleted}`,
    });
    results.push({
      criterion: "assistant response readable",
      status: foregroundObservation.assistantObserved ? "PASS" : "FAIL",
      evidence: foregroundObservation.assistantObserved
        ? "assistant DOM content after the matching probe message was readable and stable"
        : "no stable assistant DOM content was found after the matching probe message",
    });

    const backgroundPage = await context.newPage();
    await backgroundPage.goto("about:blank");
    await backgroundPage.bringToFront();
    const backgroundMarker = probeMarker("BACKGROUND");
    const backgroundObservation = await submitAndObserve(page, backgroundMarker, false);
    results.push({
      criterion: "background tab send/observe",
      status: backgroundObservation.userObserved && backgroundObservation.assistantObserved ? "PASS" : "FAIL",
      evidence: backgroundObservation.userObserved && backgroundObservation.assistantObserved
        ? "matching user and assistant messages were observed while another tab remained foreground"
        : `userObserved=${backgroundObservation.userObserved}, assistantObserved=${backgroundObservation.assistantObserved}`,
    });
    await backgroundPage.close();
    await page.bringToFront();
  } else {
    for (const criterion of ["semantic submit", "streaming completion detection", "assistant response readable", "background tab send/observe"]) {
      results.push({ criterion, status: "FAIL", evidence: "semantic composer prerequisite unavailable" });
    }
  }

  results.push({
    criterion: "conversation identity",
    status: identity ? "PASS" : "FAIL",
    evidence: identity
      ? "chatgpt.com /c/<id> identity parsed after the conversation was materialized"
      : "No chatgpt.com /c/<id> URL after semantic submission",
  });

  const boundUrl = identity ? `https://chatgpt.com/c/${identity}` : page.url();
  await context.close();
  context = await launch();
  page = context.pages()[0] ?? await context.newPage();
  await page.goto(boundUrl, { waitUntil: "domcontentloaded" });
  const reopenedIdentity = conversationIdentity(page.url());
  const reopenedComposer = await waitForEditableTextbox(page);
  const loginPersisted = Boolean(identity && reopenedIdentity === identity && reopenedComposer);
  results.push({
    criterion: "persistent manual login",
    status: loginPersisted ? "PASS" : "FAIL",
    evidence: loginPersisted
      ? "dedicated profile reopened the same conversation with an editable composer"
      : "same authenticated conversation and composer were not restored",
  });

  console.log("Open the same conversation in ChatGPT Desktop and confirm both fixed probe messages are visible there.");
  const desktop = (await rl.question("Visible in Desktop? [y/N] ")).trim().toLowerCase() === "y";
  results.push({
    criterion: "Desktop/Web same conversation",
    status: desktop ? "PASS" : "FAIL",
    evidence: desktop ? "operator confirmed the same cloud conversation" : "operator did not confirm synchronization",
  });

  const environment = {
    chromeVersion: context.browser()?.version() ?? "unavailable",
    playwrightVersion,
    nodeVersion: process.version,
    windowsRelease: osRelease(),
  };
  console.log("\nASR ChatGPT feasibility results:");
  console.table(results);
  console.log(JSON.stringify({ environment, conversationIdentityDetected: Boolean(identity), results }, null, 2));
  process.exitCode = results.every((result) => result.status === "PASS") ? 0 : 1;
} finally {
  await context?.close().catch((error: unknown) => {
    console.error(`Failed to close the dedicated browser context: ${errorMessage(error)}`);
  });
  rl.close();
}

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

async function waitForConversationIdentity(page: Page): Promise<string | undefined> {
  try {
    await page.waitForURL((url) => conversationIdentity(url.href) !== undefined, { timeout: probeTimeoutMs });
    return conversationIdentity(page.url());
  } catch (error) {
    console.error(`Conversation URL did not materialize: ${errorMessage(error)}`);
    return undefined;
  }
}

async function findEditableTextbox(page: Page): Promise<Locator | undefined> {
  const textboxes = page.getByRole("textbox");
  for (let index = (await textboxes.count()) - 1; index >= 0; index -= 1) {
    const candidate = textboxes.nth(index);
    if (await candidate.isVisible().catch(() => false) && await candidate.isEditable().catch(() => false)) return candidate;
  }
  return undefined;
}

async function waitForEditableTextbox(page: Page): Promise<Locator | undefined> {
  try {
    await page.waitForFunction(
      () => [...document.querySelectorAll<HTMLElement>('[role="textbox"], textarea, [contenteditable="true"]')]
        .some((element) => element.getClientRects().length > 0 && !element.hasAttribute("disabled")),
      undefined,
      { timeout: probeTimeoutMs },
    );
    return findEditableTextbox(page);
  } catch (error) {
    console.error(`Editable conversation composer did not reappear: ${errorMessage(error)}`);
    return undefined;
  }
}

async function findSendButton(page: Page): Promise<Locator | undefined> {
  const buttons = page.getByRole("button", { name: /send|发送/i });
  for (let index = (await buttons.count()) - 1; index >= 0; index -= 1) {
    const candidate = buttons.nth(index);
    if (await candidate.isVisible().catch(() => false) && await candidate.isEnabled().catch(() => false)) return candidate;
  }
  return undefined;
}

async function submitAndObserve(page: Page, marker: string, requireGenerationLifecycle: boolean): Promise<ProbeObservation> {
  const composer = await findEditableTextbox(page);
  if (!composer) return failedObservation();

  const prompt = requireGenerationLifecycle
    ? `${marker} — Return a numbered list from 1 to 40, then finish with ASR_FEASIBILITY_COMPLETE.`
    : `${marker} — Reply with ASR_BACKGROUND_COMPLETE.`;
  await composer.fill(prompt);
  const sendButton = await findSendButton(page);
  if (!sendButton) return failedObservation();

  const generationStartedPromise = waitForGenerationState(page, true, 30_000);
  await sendButton.click();
  const userObserved = await waitForMessage(page, marker, "user");
  const generationStarted = await generationStartedPromise;
  const assistantObserved = await waitForCorrelatedAssistant(page, marker);
  const generationCompleted = generationStarted
    ? await waitForGenerationState(page, false, probeTimeoutMs) && assistantObserved
    : false;

  return { userObserved, assistantObserved, generationStarted, generationCompleted };
}

async function waitForMessage(page: Page, marker: string, role: "user" | "assistant"): Promise<boolean> {
  try {
    await page.waitForFunction(
      ({ expectedMarker, expectedRole }) => [...document.querySelectorAll<HTMLElement>(`[data-message-author-role="${expectedRole}"]`)]
        .some((node) => node.innerText.includes(expectedMarker)),
      { expectedMarker: marker, expectedRole: role },
      { timeout: probeTimeoutMs },
    );
    return true;
  } catch (error) {
    console.error(`Timed out observing ${role} message for ${marker}: ${errorMessage(error)}`);
    return false;
  }
}

async function waitForCorrelatedAssistant(page: Page, marker: string): Promise<boolean> {
  try {
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

    let previous = "";
    let stableSamples = 0;
    for (let attempt = 0; attempt < 20 && stableSamples < 3; attempt += 1) {
      const current = await correlatedAssistantText(page, marker);
      stableSamples = current.length > 0 && current === previous ? stableSamples + 1 : 0;
      previous = current;
      await page.waitForTimeout(500);
    }
    return stableSamples >= 3;
  } catch (error) {
    console.error(`Timed out observing correlated assistant response for ${marker}: ${errorMessage(error)}`);
    return false;
  }
}

async function correlatedAssistantText(page: Page, marker: string): Promise<string> {
  return page.evaluate((expectedMarker) => {
    const messages = [...document.querySelectorAll<HTMLElement>("[data-message-author-role]")];
    const userIndex = messages.findIndex((node) => node.dataset.messageAuthorRole === "user" && node.innerText.includes(expectedMarker));
    return messages.slice(userIndex + 1)
      .find((node) => node.dataset.messageAuthorRole === "assistant")?.innerText.trim() ?? "";
  }, marker);
}

async function waitForGenerationState(page: Page, active: boolean, timeout: number): Promise<boolean> {
  try {
    await page.waitForFunction(
      ({ expectedActive }) => {
        const visibleStopControl = [...document.querySelectorAll<HTMLElement>("button")].some((button) => {
          const accessibleText = `${button.getAttribute("aria-label") ?? ""} ${button.getAttribute("title") ?? ""} ${button.innerText}`;
          return /stop|停止|中止/i.test(accessibleText) && button.getClientRects().length > 0;
        });
        return visibleStopControl === expectedActive;
      },
      { expectedActive: active },
      { timeout },
    );
    return true;
  } catch (error) {
    console.error(`Generation state active=${active} was not observed: ${errorMessage(error)}`);
    return false;
  }
}

function probeMarker(kind: "STREAM" | "BACKGROUND"): string {
  return `ASR_FEASIBILITY_${kind}_${new Date().toISOString().replace(/[^0-9]/g, "")}`;
}

function failedObservation(): ProbeObservation {
  return { userObserved: false, assistantObserved: false, generationStarted: false, generationCompleted: false };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
