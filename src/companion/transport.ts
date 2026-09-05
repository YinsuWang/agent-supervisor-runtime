import { chromium, type Page } from "playwright";
import { ConversationBindingSchema, type ConversationBinding } from "../conversations/binding.js";
import type { TransportLease } from "../conversations/lease.js";
import { TransportLeaseError } from "../conversations/lease.js";
import { TransportManager } from "../conversations/transport-manager.js";
import type {
  ConversationTransport,
  ResponseRequest,
  TransportHealth,
  TransportMessage,
  TransportResponse,
  TransportSendContext,
} from "../conversations/transport.js";
import type { ChatGptPageDriver, PageMessage } from "../page-driver/contracts.js";
import { PlaywrightChatGptPageDriver } from "../page-driver/playwright-backend.js";
import { assertCompanionProfileDirectory } from "./profile.js";

export interface CompanionPage {
  goto(url: string): Promise<unknown>;
  url(): string;
}

export interface CompanionBrowserContext {
  pages(): CompanionPage[];
  newPage(): Promise<CompanionPage>;
  close(): Promise<void>;
}

export type BackgroundWebTransportOptions = {
  profileDir: string;
  manager: TransportManager;
  id?: string;
  priority?: number;
  leaseTtlMs?: number;
  pageReadyTimeoutMs?: number;
  submitObservationTimeoutMs?: number;
  responseTimeoutMs?: number;
  pollIntervalMs?: number;
  launchContext?: (profileDir: string) => Promise<CompanionBrowserContext>;
  createPageDriver?: (page: CompanionPage, expectedConversationId: string) => ChatGptPageDriver;
};

export type CompanionTransportErrorCode =
  | "AUTH_REQUIRED"
  | "INCOMPATIBLE"
  | "NOT_ACTIVE"
  | "WRONG_BINDING"
  | "RESPONSE_TIMEOUT";

export class CompanionTransportError extends Error {
  constructor(readonly code: CompanionTransportErrorCode, message: string) {
    super(message);
    this.name = "CompanionTransportError";
  }
}

export class BackgroundWebTransport implements ConversationTransport {
  readonly id: string;
  readonly #profileDir: string;
  readonly #manager: TransportManager;
  readonly #leaseTtlMs: number;
  readonly #pageReadyTimeoutMs: number;
  readonly #submitObservationTimeoutMs: number;
  readonly #responseTimeoutMs: number;
  readonly #pollIntervalMs: number;
  readonly #launchContext: (profileDir: string) => Promise<CompanionBrowserContext>;
  readonly #createPageDriver: (page: CompanionPage, expectedConversationId: string) => ChatGptPageDriver;
  #context?: CompanionBrowserContext;
  #driver?: ChatGptPageDriver;
  #binding?: ConversationBinding;
  #lease?: TransportLease;
  #detail?: string;

  constructor(options: BackgroundWebTransportOptions) {
    this.id = options.id ?? "background-web";
    this.#profileDir = assertCompanionProfileDirectory(options.profileDir);
    this.#manager = options.manager;
    this.#leaseTtlMs = options.leaseTtlMs ?? 15_000;
    this.#pageReadyTimeoutMs = options.pageReadyTimeoutMs ?? 30_000;
    this.#submitObservationTimeoutMs = options.submitObservationTimeoutMs ?? 30_000;
    this.#responseTimeoutMs = options.responseTimeoutMs ?? 120_000;
    this.#pollIntervalMs = options.pollIntervalMs ?? 100;
    this.#launchContext = options.launchContext ?? launchPersistentCompanionContext;
    this.#createPageDriver = options.createPageDriver ?? ((page, expected) =>
      new PlaywrightChatGptPageDriver(page as Page, {
        expectedConversationId: expected,
        submitObservationTimeoutMs: this.#submitObservationTimeoutMs,
      }));
    this.#manager.register(this, options.priority ?? 10);
  }

  currentLease(): TransportLease | undefined {
    return this.#lease ? { ...this.#lease } : undefined;
  }

  async connect(bindingInput: ConversationBinding): Promise<void> {
    const binding = ConversationBindingSchema.parse(bindingInput);
    if (this.#binding && this.#binding.bindingId !== binding.bindingId) {
      throw new CompanionTransportError("WRONG_BINDING", `Companion is already bound to ${this.#binding.bindingId}`);
    }
    this.#binding = binding;
    if (!this.#context) {
      this.#context = await this.#launchContext(this.#profileDir);
      const page = this.#context.pages()[0] ?? await this.#context.newPage();
      await page.goto(binding.conversationUrl);
      this.#driver = this.#createPageDriver(page, binding.conversationId);
    }
    await this.waitForPageReady();
    if (this.#manager.status(this.id) === "DRAINING") {
      this.#detail = "Draining the current exchange before handback";
      return;
    }
    try {
      let acquired: TransportLease | undefined;
      if (this.#lease && this.#manager.status(this.id) === "ACTIVE") {
        try {
          acquired = await this.#manager.renew(binding.bindingId, this.id, this.#lease.epoch, this.#leaseTtlMs);
        } catch (error) {
          if (!(error instanceof TransportLeaseError) || error.code !== "STALE_LEASE") throw error;
          this.#lease = undefined;
        }
      }
      acquired ??= await this.#manager.acquire(binding.bindingId, this.id, this.#leaseTtlMs);
      if (acquired) this.#lease = acquired;
      this.#detail = undefined;
    } catch (error) {
      if (!(error instanceof TransportLeaseError) || error.code !== "LEASE_HELD") throw error;
      this.#lease = undefined;
      this.#detail = "Higher-priority transport is active";
    }
  }

  async send(message: TransportMessage, context: TransportSendContext): Promise<void> {
    this.assertBinding(message.bindingId);
    await this.assertPageReady();
    if (!this.#lease || this.#lease.epoch !== context.leaseEpoch) {
      throw new CompanionTransportError("NOT_ACTIVE", "Background companion does not hold the requested lease epoch");
    }
    await this.#manager.assertSendAuthority(message.bindingId, this.id, context.leaseEpoch);
    this.setExchangeInFlight(true);
    try {
      await this.requireDriver().submitMessage(message.content);
    } catch (error) {
      this.setExchangeInFlight(false);
      throw error;
    }
  }

  async waitForResponse(request: ResponseRequest): Promise<TransportResponse> {
    this.assertBinding(request.bindingId);
    const deadline = Date.now() + this.#responseTimeoutMs;
    try {
      while (Date.now() <= deadline) {
        const messages: PageMessage[] = [];
        for await (const message of this.requireDriver().observeMessages()) messages.push(message);
        const response = findCorrelatedAssistant(messages, request.inReplyTo);
        if (response && await this.requireDriver().detectGenerationState() === "IDLE") return { content: response };
        if (this.#pollIntervalMs > 0) await delay(this.#pollIntervalMs);
      }
      throw new CompanionTransportError("RESPONSE_TIMEOUT", `No correlated response for ${request.inReplyTo}`);
    } finally {
      this.setExchangeInFlight(false);
    }
  }

  async health(): Promise<TransportHealth> {
    if (!this.#context || !this.#driver) return { status: "OFFLINE" };
    try {
      await this.assertPageReady();
    } catch (error) {
      if (!(error instanceof CompanionTransportError)) throw error;
    }
    if (this.#detail === "AUTH_REQUIRED" || this.#detail === "INCOMPATIBLE") {
      return { status: "OFFLINE", detail: this.#detail };
    }
    return { status: this.#manager.status(this.id) ?? "OFFLINE", detail: this.#detail };
  }

  async disconnect(): Promise<void> {
    if (this.#lease) {
      this.setExchangeInFlight(false);
      await this.#manager.release(this.#lease.bindingId, this.id, this.#lease.epoch).catch(() => undefined);
    }
    await this.#context?.close();
    this.#context = undefined;
    this.#driver = undefined;
    this.#binding = undefined;
    this.#lease = undefined;
    this.#detail = undefined;
  }

  private async assertPageReady(): Promise<void> {
    const driver = this.requireDriver();
    const health = await driver.health();
    if (health.status === "COMPATIBLE") {
      this.#detail = undefined;
      return;
    }
    const pageUrl = this.#context?.pages()[0]?.url() ?? "";
    const authRequired = /^https:\/\/chatgpt\.com\/(?:auth|login)(?:\/|$)/.test(pageUrl)
      || (pageUrl === "https://chatgpt.com/" && !health.composer);
    const code: CompanionTransportErrorCode = authRequired ? "AUTH_REQUIRED" : "INCOMPATIBLE";
    this.#detail = code;
    throw new CompanionTransportError(code, `Background companion page is ${code}`);
  }

  private async waitForPageReady(): Promise<void> {
    const deadline = Date.now() + this.#pageReadyTimeoutMs;
    let lastError: CompanionTransportError | undefined;
    while (Date.now() <= deadline) {
      try {
        await this.assertPageReady();
        return;
      } catch (error) {
        if (!(error instanceof CompanionTransportError)) throw error;
        if (error.code === "AUTH_REQUIRED") throw error;
        lastError = error;
      }
      await delay(Math.min(this.#pollIntervalMs || 50, Math.max(1, deadline - Date.now())));
    }
    throw lastError ?? new CompanionTransportError("INCOMPATIBLE", "Background companion page did not become ready");
  }

  private assertBinding(bindingId: string): void {
    if (!this.#binding || this.#binding.bindingId !== bindingId) {
      throw new CompanionTransportError("WRONG_BINDING", `Expected ${this.#binding?.bindingId ?? "no binding"}, received ${bindingId}`);
    }
  }

  private requireDriver(): ChatGptPageDriver {
    if (!this.#driver) throw new CompanionTransportError("NOT_ACTIVE", "Background companion is not connected");
    return this.#driver;
  }

  private setExchangeInFlight(value: boolean): void {
    this.#manager.setExchangeInFlight(this.id, value);
  }
}

export async function launchPersistentCompanionContext(profileDir: string): Promise<CompanionBrowserContext> {
  return chromium.launchPersistentContext(profileDir, {
    channel: "chrome",
    headless: false,
    args: process.platform === "win32" ? ["--start-minimized"] : [],
  });
}

function findCorrelatedAssistant(messages: readonly PageMessage[], inReplyTo: string): string | undefined {
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    const normalized = unwrapJsonFence(message.content);
    try {
      const parsed = JSON.parse(normalized) as { inReplyTo?: unknown };
      if (parsed.inReplyTo === inReplyTo) return normalized;
    } catch {
      // Partial streaming content is expected until generation completes.
    }
  }
  return undefined;
}

function unwrapJsonFence(content: string): string {
  const trimmed = content.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return match?.[1]?.trim() ?? trimmed;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
