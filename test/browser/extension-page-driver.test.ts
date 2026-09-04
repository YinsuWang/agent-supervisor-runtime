import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import type { GenerationState, PageMessage, SubmitReceipt } from "../../src/page-driver/contracts.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const fixtureUrl = "https://chatgpt.com/c/fake-conversation";
let browser: Browser;
let page: Page;
let fixtureHtml: string;
let backendBundle: string;

beforeAll(async () => {
  fixtureHtml = await readFile(join(testDir, "fixtures", "fake-chatgpt.html"), "utf8");
  const result = await build({
    entryPoints: [join(testDir, "../../src/page-driver/extension-backend.ts")],
    bundle: true,
    format: "iife",
    globalName: "AsrPageDriver",
    platform: "browser",
    write: false,
  });
  backendBundle = result.outputFiles[0]!.text;
  browser = await chromium.launch({ channel: "chrome", headless: true });
}, 30_000);

beforeEach(async () => {
  page = await browser.newPage();
  await page.route(fixtureUrl, (route) => route.fulfill({ contentType: "text/html", body: fixtureHtml }));
  await page.goto(fixtureUrl);
  await page.addScriptTag({ content: backendBundle });
});

afterEach(async () => page?.close());
afterAll(async () => browser?.close());

describe("ExtensionChatGptPageDriver", () => {
  it("deduplicates repeated DOM message nodes", async () => {
    await submitWithExtensionBackend(page, "dedupe probe");
    await expect(page.evaluate(async () => {
      const driver = new window.AsrPageDriver.ExtensionChatGptPageDriver({ expectedConversationId: "fake-conversation" });
      return driver.health();
    })).resolves.toMatchObject({ status: "COMPATIBLE", submit: true, generationLifecycle: true });
    await page.evaluate(() => window.fakeChatGpt.completeGeneration());
    await page.evaluate(() => window.fakeChatGpt.duplicateLastMessage());

    const messages = await extensionMessages(page);
    expect(messages.filter((message) => message.role === "assistant")).toHaveLength(1);
  });

  it("distinguishes interrupted generation and retry/error UI", async () => {
    await submitWithExtensionBackend(page, "interrupt probe");
    await page.evaluate(() => window.fakeChatGpt.interruptGeneration());
    await expect(extensionGenerationState(page)).resolves.toBe("INTERRUPTED");

    await page.evaluate(() => window.fakeChatGpt.triggerError());
    await expect(extensionGenerationState(page)).resolves.toBe("ERROR");
  });

  it("fails closed before sending to the wrong conversation", async () => {
    const result = await page.evaluate(async () => {
      const driver = new window.AsrPageDriver.ExtensionChatGptPageDriver({ expectedConversationId: "different-conversation" });
      try {
        await driver.submitMessage("must not send");
        return { code: "NO_ERROR" };
      } catch (error) {
        return { code: (error as { code?: string }).code };
      }
    });
    expect(result.code).toBe("WRONG_CONVERSATION");
    await expect(page.evaluate(async () => {
      const driver = new window.AsrPageDriver.ExtensionChatGptPageDriver({ expectedConversationId: "different-conversation" });
      try {
        for await (const _message of driver.observeMessages()) { /* consume */ }
        return "NO_ERROR";
      } catch (error) {
        return (error as { code?: string }).code;
      }
    })).resolves.toBe("WRONG_CONVERSATION");
    await expect(page.locator('[data-message-author-role="user"]').count()).resolves.toBe(0);
  });

  it("waits for a semantic send control rendered after the input event", async () => {
    await page.evaluate(() => {
      const composer = document.querySelector<HTMLElement>("#composer")!;
      const send = document.querySelector<HTMLButtonElement>("#send")!;
      send.remove();
      composer.addEventListener("input", () => setTimeout(() => document.body.append(send), 0), { once: true });
    });

    await expect(submitWithExtensionBackend(page, "async send probe")).resolves.toMatchObject({ messageId: expect.any(String) });
  });
});

function submitWithExtensionBackend(target: Page, message: string): Promise<SubmitReceipt> {
  return target.evaluate(async (value) => {
    const driver = new window.AsrPageDriver.ExtensionChatGptPageDriver({ expectedConversationId: "fake-conversation" });
    return driver.submitMessage(value);
  }, message);
}

function extensionGenerationState(target: Page): Promise<GenerationState> {
  return target.evaluate(async () => {
    const driver = new window.AsrPageDriver.ExtensionChatGptPageDriver({ expectedConversationId: "fake-conversation" });
    return driver.detectGenerationState();
  });
}

function extensionMessages(target: Page): Promise<PageMessage[]> {
  return target.evaluate(async () => {
    const driver = new window.AsrPageDriver.ExtensionChatGptPageDriver({ expectedConversationId: "fake-conversation" });
    const messages: PageMessage[] = [];
    for await (const message of driver.observeMessages()) messages.push(message);
    return messages;
  });
}

declare global {
  interface Window {
    AsrPageDriver: {
      ExtensionChatGptPageDriver: new (options: { expectedConversationId: string }) => {
        submitMessage(message: string): Promise<SubmitReceipt>;
        detectGenerationState(): Promise<GenerationState>;
        observeMessages(): AsyncIterable<PageMessage>;
        health(): Promise<{ status: string; submit: boolean; generationLifecycle: boolean }>;
      };
    };
    fakeChatGpt: {
      completeGeneration(): void;
      duplicateLastMessage(): void;
      interruptGeneration(): void;
      triggerError(): void;
    };
  }
}
