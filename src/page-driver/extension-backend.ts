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
  accessibleControlName,
  CHATGPT_WEB_COMPATIBILITY_PROFILE as profile,
  conversationIdentityFromPageUrl,
  messagesAfterCursor,
  normalizePageMessages,
} from "./profile.js";

export class ExtensionChatGptPageDriver implements ChatGptPageDriver {
  private readonly timeoutMs: number;

  constructor(
    private readonly options: PageDriverOptions = {},
    private readonly documentRef: Document = document,
    private readonly locationRef: Location = location,
  ) {
    this.timeoutMs = options.submitObservationTimeoutMs ?? 10_000;
  }

  async inspectConversation(): Promise<PageConversationIdentity> {
    try {
      return conversationIdentityFromPageUrl(this.locationRef.href);
    } catch {
      throw new PageDriverError("CONVERSATION_IDENTITY_UNAVAILABLE", "ChatGPT conversation identity is unavailable");
    }
  }

  async submitMessage(message: string): Promise<SubmitReceipt> {
    await this.assertExpectedConversation();
    const composer = this.findComposer();
    if (!composer) throw new PageDriverError("COMPOSER_UNAVAILABLE", "Editable ChatGPT composer is unavailable");
    this.setComposerValue(composer, message);
    const send = await this.waitForButton(profile.sendName, profile.sendSelectors);
    if (!send) throw new PageDriverError("SUBMIT_UNAVAILABLE", "Semantic ChatGPT send control is unavailable");
    send.click();
    const observed = await this.waitForUserMessage(message);
    if (!observed) throw new PageDriverError("SUBMIT_NOT_OBSERVED", "Submitted ChatGPT message was not observed");
    return { messageId: observed.id };
  }

  async *observeMessages(cursor?: MessageCursor): AsyncIterable<PageMessage> {
    await this.assertExpectedConversation();
    const messages = this.snapshotMessages();
    const selected = messagesAfterCursor(messages, cursor?.afterMessageId);
    if (!selected) throw new PageDriverError("CURSOR_NOT_FOUND", `Message cursor not found: ${cursor?.afterMessageId}`);
    for (const message of selected) yield message;
  }

  async detectGenerationState(): Promise<GenerationState> {
    await this.assertExpectedConversation();
    if (this.findButton(profile.retryName, true, false)) return "ERROR";
    if (this.findButton(profile.continueName, true, false)) return "INTERRUPTED";
    if (this.findButton(profile.stopName, true, false, profile.stopSelectors)) return "GENERATING";
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
    const composer = this.findComposer();
    const assistantMessages =
      this.documentRef.querySelector(profile.messageSelector) !== null
      || profile.messageContainerSelectors.some((selector) => this.documentRef.querySelector(selector) !== null);
    return evaluatePageCompatibility({
      conversationIdentity,
      composer: Boolean(composer),
      submit: composer ? await this.probeSubmitCapability(composer) : false,
      assistantMessages,
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

  private findComposer(): HTMLElement | undefined {
    for (const selector of profile.composerSelectors) {
      const candidates = Array.from(this.documentRef.querySelectorAll<HTMLElement>(selector));
      const match = candidates.find((candidate) => this.isVisible(candidate) && this.isEditable(candidate));
      if (match) return match;
    }
    return undefined;
  }

  private findButton(
    name: RegExp,
    visibleOnly: boolean,
    enabledOnly: boolean,
    stableSelectors: readonly string[] = [],
  ): HTMLButtonElement | undefined {
    for (const selector of stableSelectors) {
      const candidates = Array.from(this.documentRef.querySelectorAll<HTMLButtonElement>(selector)).reverse();
      const match = candidates.find((button) => (!enabledOnly || !button.disabled) && (!visibleOnly || this.isVisible(button)));
      if (match) return match;
    }
    return Array.from(this.documentRef.querySelectorAll<HTMLButtonElement>("button")).reverse()
      .find((button) => name.test(accessibleControlName(button))
        && (!enabledOnly || !button.disabled)
        && (!visibleOnly || this.isVisible(button)));
  }

  private async probeSubmitCapability(composer: HTMLElement): Promise<boolean> {
    if (this.findButton(profile.sendName, false, false, profile.sendSelectors)) return true;
    const existing = composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement
      ? composer.value
      : composer.textContent ?? "";
    if (existing.trim()) return false;
    this.setComposerValue(composer, "ASR compatibility probe");
    try {
      await new Promise<void>((resolve) => this.documentRef.defaultView?.requestAnimationFrame(() => resolve()));
      return Boolean(this.findButton(profile.sendName, false, false, profile.sendSelectors));
    } finally {
      this.setComposerValue(composer, "");
    }
  }

  private async waitForButton(name: RegExp, stableSelectors: readonly string[]): Promise<HTMLButtonElement | undefined> {
    const immediate = this.findButton(name, true, true, stableSelectors);
    if (immediate) return immediate;
    return new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        const match = this.findButton(name, true, true, stableSelectors);
        if (!match) return;
        clearTimeout(timer);
        observer.disconnect();
        resolve(match);
      });
      const timer = setTimeout(() => {
        observer.disconnect();
        resolve(undefined);
      }, this.timeoutMs);
      observer.observe(this.documentRef.documentElement, {
        attributes: true,
        attributeFilter: ["aria-label", "data-testid", "disabled", "hidden"],
        childList: true,
        subtree: true,
      });
    });
  }

  private snapshotMessages(): PageMessage[] {
    return normalizePageMessages(Array.from(this.documentRef.querySelectorAll<HTMLElement>(profile.messageSelector)).map((node) => ({
      id: node.dataset.messageId,
      role: node.dataset.messageAuthorRole,
      content: node.innerText ?? node.textContent ?? "",
    })));
  }

  private async waitForUserMessage(content: string): Promise<PageMessage | undefined> {
    const existing = [...this.snapshotMessages()].reverse().find((message) => message.role === "user" && message.content.includes(content));
    if (existing) return existing;
    return new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        const match = [...this.snapshotMessages()].reverse().find((message) => message.role === "user" && message.content.includes(content));
        if (!match) return;
        clearTimeout(timer);
        observer.disconnect();
        resolve(match);
      });
      const timer = setTimeout(() => {
        observer.disconnect();
        resolve(undefined);
      }, this.timeoutMs);
      observer.observe(this.documentRef.documentElement, { childList: true, subtree: true, characterData: true });
    });
  }

  private setComposerValue(composer: HTMLElement, value: string): void {
    composer.focus();
    if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
      const prototype = composer instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      setter?.call(composer, value);
    } else {
      const selection = this.documentRef.defaultView?.getSelection();
      const range = this.documentRef.createRange();
      range.selectNodeContents(composer);
      selection?.removeAllRanges();
      selection?.addRange(range);
      const inserted = this.documentRef.execCommand("insertText", false, value);
      if (!inserted) composer.textContent = value;
    }
    composer.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, data: value, inputType: "insertText" }));
  }

  private isEditable(element: HTMLElement): boolean {
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) return !element.disabled && !element.readOnly;
    return element.isContentEditable;
  }

  private isVisible(element: HTMLElement): boolean {
    return element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
  }
}
