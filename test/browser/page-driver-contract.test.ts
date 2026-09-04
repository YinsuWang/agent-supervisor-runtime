import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import type {
  ChatGptPageDriver,
  GenerationState,
  MessageCursor,
  PageCompatibility,
  PageConversationIdentity,
  PageMessage,
  SubmitReceipt,
} from "../../src/page-driver/contracts.js";
import { evaluatePageCompatibility } from "../../src/page-driver/compatibility.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, "fixtures", "fake-chatgpt.html");

class FixturePageDriver implements ChatGptPageDriver {
  constructor(private readonly page: Page) {}

  async inspectConversation(): Promise<PageConversationIdentity> {
    const root = this.page.locator("#conversation-root");
    const conversationId = await root.getAttribute("data-conversation-id");
    const conversationUrl = await root.getAttribute("data-conversation-url");
    if (!conversationId || !conversationUrl) throw new Error("CONVERSATION_IDENTITY_UNAVAILABLE");
    return { conversationId, conversationUrl };
  }

  async submitMessage(message: string): Promise<SubmitReceipt> {
    const composer = this.page.getByRole("textbox", { name: "Message ChatGPT" });
    await composer.fill(message);
    await this.page.getByRole("button", { name: "Send message" }).click();
    const userMessages = this.page.locator('[data-message-author-role="user"]');
    await expect.poll(async () => userMessages.count()).toBeGreaterThan(0);
    const messageId = await userMessages.last().getAttribute("data-message-id");
    if (!messageId) throw new Error("SUBMIT_RECEIPT_UNAVAILABLE");
    return { messageId };
  }

  async *observeMessages(cursor?: MessageCursor): AsyncIterable<PageMessage> {
    const nodes = this.page.locator("[data-message-author-role]");
    const count = await nodes.count();
    let include = cursor?.afterMessageId === undefined;
    for (let index = 0; index < count; index += 1) {
      const node = nodes.nth(index);
      const id = await node.getAttribute("data-message-id");
      const role = await node.getAttribute("data-message-author-role");
      if (!id || (role !== "user" && role !== "assistant")) continue;
      if (!include) {
        if (id === cursor?.afterMessageId) include = true;
        continue;
      }
      yield { id, role, content: (await node.textContent()) ?? "" };
    }
  }

  async detectGenerationState(): Promise<GenerationState> {
    return (await this.page.getByRole("button", { name: "Stop generating" }).isVisible())
      ? "GENERATING"
      : "IDLE";
  }

  async health(): Promise<PageCompatibility> {
    const report = {
      conversationIdentity:
        (await this.page.locator('#conversation-root[data-conversation-id][data-conversation-url]').count()) === 1,
      composer: (await this.page.getByRole("textbox", { name: "Message ChatGPT" }).count()) === 1,
      submit: (await this.page.getByRole("button", { name: "Send message" }).count()) === 1,
      assistantMessages: (await this.page.locator('#messages[aria-label="Conversation messages"]').count()) === 1,
      generationLifecycle: (await this.page.locator('button[aria-label="Stop generating"]').count()) === 1,
    };
    return evaluatePageCompatibility(report);
  }
}

let browser: Browser;
let page: Page;
let driver: FixturePageDriver;

beforeAll(async () => {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  page = await browser.newPage();
  await page.setContent(await readFile(fixturePath, "utf8"), { waitUntil: "load" });
  driver = new FixturePageDriver(page);
}, 30_000);

afterAll(async () => {
  await browser?.close();
});

describe("ChatGptPageDriver semantic contract", { timeout: 30_000 }, () => {
  it("inspects the bound conversation and reports all semantic capabilities", async () => {
    await expect(driver.inspectConversation()).resolves.toEqual({
      conversationId: "fake-conversation",
      conversationUrl: "https://chatgpt.com/c/fake-conversation",
    });
    await expect(driver.health()).resolves.toMatchObject({ status: "COMPATIBLE", missing: [] });
  });

  it("submits, observes streaming completion, and reads the assistant response", async () => {
    const receipt = await driver.submitMessage("hello fixture");
    expect(receipt.messageId).toMatch(/^user-/);
    expect(await driver.detectGenerationState()).toBe("GENERATING");

    await page.evaluate(() => {
      (window as typeof window & { fakeChatGpt: { emitNextChunk(): void } }).fakeChatGpt.emitNextChunk();
    });
    const streaming: PageMessage[] = [];
    for await (const message of driver.observeMessages()) streaming.push(message);
    expect(streaming).toContainEqual(expect.objectContaining({ role: "assistant", content: "Fake " }));

    await page.evaluate(() => {
      (window as typeof window & { fakeChatGpt: { completeGeneration(): void } }).fakeChatGpt.completeGeneration();
    });
    await expect.poll(() => driver.detectGenerationState()).toBe("IDLE");
    const observed: PageMessage[] = [];
    for await (const message of driver.observeMessages()) observed.push(message);
    expect(observed).toContainEqual(expect.objectContaining({ role: "user", content: "hello fixture" }));
    expect(observed).toContainEqual(expect.objectContaining({ role: "assistant", content: "Fake assistant response" }));
  });

  it("fails closed when a required semantic capability disappears", async () => {
    await page.getByRole("button", { name: "Break composer capability" }).click();
    await expect(driver.health()).resolves.toMatchObject({
      status: "INCOMPATIBLE",
      composer: false,
      missing: expect.arrayContaining(["composer"]),
    });
  });
});
