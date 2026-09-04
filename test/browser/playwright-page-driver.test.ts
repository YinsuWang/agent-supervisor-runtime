import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { PlaywrightChatGptPageDriver } from "../../src/page-driver/playwright-backend.js";

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "fake-chatgpt.html");
const fixtureUrl = "https://chatgpt.com/c/fake-conversation";

let browser: Browser;
let page: Page;
let fixtureHtml: string;

beforeAll(async () => {
  fixtureHtml = await readFile(fixturePath, "utf8");
  browser = await chromium.launch({ channel: "chrome", headless: true });
});

beforeEach(async () => {
  page = await browser.newPage();
  await page.route(fixtureUrl, (route) => route.fulfill({ contentType: "text/html", body: fixtureHtml }));
  await page.goto(fixtureUrl);
});

afterEach(async () => page.close());
afterAll(async () => browser.close());

describe("PlaywrightChatGptPageDriver", () => {
  it("deduplicates repeated DOM message nodes", async () => {
    const driver = new PlaywrightChatGptPageDriver(page, { expectedConversationId: "fake-conversation" });
    await driver.submitMessage("dedupe probe");
    await expect(driver.health()).resolves.toMatchObject({ status: "COMPATIBLE", submit: true, generationLifecycle: true });
    await completeGeneration(page);
    await page.evaluate(() => window.fakeChatGpt.duplicateLastMessage());

    const messages = await collect(driver.observeMessages());
    expect(messages.filter((message) => message.role === "assistant")).toHaveLength(1);
  });

  it("distinguishes interrupted generation and retry/error UI", async () => {
    const driver = new PlaywrightChatGptPageDriver(page, { expectedConversationId: "fake-conversation" });
    await driver.submitMessage("interrupt probe");
    await page.evaluate(() => window.fakeChatGpt.interruptGeneration());
    await expect(driver.detectGenerationState()).resolves.toBe("INTERRUPTED");

    await page.evaluate(() => window.fakeChatGpt.triggerError());
    await expect(driver.detectGenerationState()).resolves.toBe("ERROR");
  });

  it("fails closed before sending to the wrong conversation", async () => {
    const driver = new PlaywrightChatGptPageDriver(page, { expectedConversationId: "different-conversation" });
    await expect(driver.submitMessage("must not send")).rejects.toMatchObject({ code: "WRONG_CONVERSATION" });
    await expect(collect(driver.observeMessages())).rejects.toMatchObject({ code: "WRONG_CONVERSATION" });
    await expect(driver.detectGenerationState()).rejects.toMatchObject({ code: "WRONG_CONVERSATION" });
    await expect(driver.health()).resolves.toMatchObject({ status: "INCOMPATIBLE", conversationIdentity: false });
    await expect(page.locator('[data-message-author-role="user"]').count()).resolves.toBe(0);
  });
});

async function completeGeneration(target: Page): Promise<void> {
  await target.evaluate(() => window.fakeChatGpt.completeGeneration());
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of iterable) values.push(value);
  return values;
}

declare global {
  interface Window {
    fakeChatGpt: {
      completeGeneration(): void;
      duplicateLastMessage(): void;
      interruptGeneration(): void;
      triggerError(): void;
    };
  }
}
