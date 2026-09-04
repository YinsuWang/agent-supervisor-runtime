import type { Locator, Page } from "playwright";
import {
  PageDriverError,
  type ChatGptPageDriver,
  type GenerationState,
  type MessageCursor,
  type PageCompatibility,
  type PageConversationIdentity,
  type PageDriverOptions,
  type PageMessage,
  type SubmitReceipt,
} from "./contracts.js";
import { evaluatePageCompatibility } from "./compatibility.js";
import {
  CHATGPT_WEB_COMPATIBILITY_PROFILE as profile,
  conversationIdentityFromPageUrl,
  messagesAfterCursor,
  normalizePageMessages,
} from "./profile.js";

export class PlaywrightChatGptPageDriver implements ChatGptPageDriver {
  private readonly timeoutMs: number;

  constructor(
    private readonly page: Page,
    private readonly options: PageDriverOptions = {},
  ) {
    this.timeoutMs = options.submitObservationTimeoutMs ?? 10_000;
  }

  async inspectConversation(): Promise<PageConversationIdentity> {
    try {
      return conversationIdentityFromPageUrl(this.page.url());
    } catch {
      throw new PageDriverError("CONVERSATION_IDENTITY_UNAVAILABLE", "ChatGPT conversation identity is unavailable");
    }
  }

  async submitMessage(message: string): Promise<SubmitReceipt> {
    await this.assertExpectedConversation();
    const composer = await this.findComposer();
    if (!composer) throw new PageDriverError("COMPOSER_UNAVAILABLE", "Editable ChatGPT composer is unavailable");
    await composer.fill(message);
    const send = await this.findButton(profile.sendName, true, true, profile.sendSelectors);
    if (!send) throw new PageDriverError("SUBMIT_UNAVAILABLE", "Semantic ChatGPT send control is unavailable");
    await send.click();
    try {
      await this.page.locator('[data-message-author-role="user"]').filter({ hasText: message }).last()
        .waitFor({ state: "attached", timeout: this.timeoutMs });
    } catch {
      throw new PageDriverError("SUBMIT_NOT_OBSERVED", "Submitted ChatGPT message was not observed");
    }
    const observed = [...await this.snapshotMessages()].reverse()
      .find((entry) => entry.role === "user" && entry.content.includes(message));
    if (!observed) throw new PageDriverError("SUBMIT_NOT_OBSERVED", "Submitted ChatGPT message was not observed");
    return { messageId: observed.id };
  }

  async *observeMessages(cursor?: MessageCursor): AsyncIterable<PageMessage> {
    await this.assertExpectedConversation();
    const messages = await this.snapshotMessages();
    const selected = messagesAfterCursor(messages, cursor?.afterMessageId);
    if (!selected) throw new PageDriverError("CURSOR_NOT_FOUND", `Message cursor not found: ${cursor?.afterMessageId}`);
    for (const message of selected) yield message;
  }

  async detectGenerationState(): Promise<GenerationState> {
    await this.assertExpectedConversation();
    if (await this.findButton(profile.retryName, true, false)) return "ERROR";
    if (await this.findButton(profile.continueName, true, false)) return "INTERRUPTED";
    if (await this.findButton(profile.stopName, true, false, profile.stopSelectors)) return "GENERATING";
    return "IDLE";
  }

  async health(): Promise<PageCompatibility> {
    let conversationIdentity = false;
    try {
      const current = await this.inspectConversation();
      conversationIdentity = !this.options.expectedConversationId
        || current.conversationId === this.options.expectedConversationId;
    } catch {
      // An unavailable or unexpected identity is incompatible.
    }
    const composer = await this.findComposer();
    const messageContainers = await Promise.all(profile.messageContainerSelectors.map((selector) => this.page.locator(selector).count()));
    const assistantMessages = await this.page.locator(profile.messageSelector).count() > 0 || messageContainers.some((count) => count > 0);
    return evaluatePageCompatibility({
      conversationIdentity,
      composer: Boolean(composer),
      submit: composer ? await this.probeSubmitCapability(composer) : false,
      assistantMessages,
      // No lifecycle control is rendered while idle. The operational smoke verifies
      // the state-specific stop control after a real, correlated submission.
      generationLifecycle: conversationIdentity && Boolean(composer) && assistantMessages,
    });
  }

  private async assertExpectedConversation(): Promise<void> {
    const expected = this.options.expectedConversationId;
    if (!expected) return;
    const current = await this.inspectConversation();
    if (current.conversationId !== expected) {
      throw new PageDriverError("WRONG_CONVERSATION", `Expected conversation ${expected}, observed ${current.conversationId}`);
    }
  }

  private async findComposer(): Promise<Locator | undefined> {
    const candidates = this.page.locator(profile.composerSelectors.join(", "));
    for (let index = (await candidates.count()) - 1; index >= 0; index -= 1) {
      const candidate = candidates.nth(index);
      if (await candidate.isVisible().catch(() => false) && await candidate.isEditable().catch(() => false)) return candidate;
    }
    return undefined;
  }

  private async findButton(
    name: RegExp,
    visibleOnly: boolean,
    enabledOnly: boolean,
    stableSelectors: readonly string[] = [],
  ): Promise<Locator | undefined> {
    for (const selector of stableSelectors) {
      const candidates = this.page.locator(selector);
      for (let index = (await candidates.count()) - 1; index >= 0; index -= 1) {
        const candidate = candidates.nth(index);
        if ((!visibleOnly || await candidate.isVisible().catch(() => false))
          && (!enabledOnly || await candidate.isEnabled().catch(() => false))) return candidate;
      }
    }
    const buttons = this.page.getByRole("button", { name, includeHidden: !visibleOnly });
    for (let index = (await buttons.count()) - 1; index >= 0; index -= 1) {
      const candidate = buttons.nth(index);
      if ((!visibleOnly || await candidate.isVisible().catch(() => false))
        && (!enabledOnly || await candidate.isEnabled().catch(() => false))) return candidate;
    }
    return undefined;
  }

  private async probeSubmitCapability(composer: Locator): Promise<boolean> {
    if (await this.findButton(profile.sendName, false, false, profile.sendSelectors)) return true;
    const existing = await composer.inputValue().catch(async () => composer.textContent() ?? "") ?? "";
    if (existing.trim()) return false;
    await composer.fill("ASR compatibility probe");
    try {
      await this.page.waitForTimeout(0);
      return Boolean(await this.findButton(profile.sendName, false, false, profile.sendSelectors));
    } finally {
      await composer.fill("");
    }
  }

  private async snapshotMessages(): Promise<PageMessage[]> {
    const records = await this.page.locator(profile.messageSelector).evaluateAll((nodes) => nodes.map((node) => {
      const element = node as HTMLElement;
      return {
        id: element.dataset.messageId,
        role: element.dataset.messageAuthorRole,
        content: element.innerText ?? element.textContent ?? "",
      };
    }));
    return normalizePageMessages(records);
  }
}
