import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { companionProfileDirectory } from "../../src/companion/profile.js";
import { BackgroundWebTransport, type CompanionBrowserContext, type CompanionPage } from "../../src/companion/transport.js";
import { InMemoryTransportLeaseStore, TransportLeaseCoordinator } from "../../src/conversations/lease.js";
import { TransportManager } from "../../src/conversations/transport-manager.js";
import type { ConversationBinding } from "../../src/conversations/binding.js";
import type {
  ChatGptPageDriver,
  GenerationState,
  MessageCursor,
  PageCompatibility,
  PageConversationIdentity,
  PageMessage,
  SubmitReceipt,
} from "../../src/page-driver/contracts.js";

const tempDirs: string[] = [];
afterEach(async () => Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

describe("Background Web Companion", () => {
  it("keeps its browser profile outside project state and default Chrome data", async () => {
    const root = await mkdtemp(join(tmpdir(), "asr-companion-profile-"));
    tempDirs.push(root);
    const profile = companionProfileDirectory({
      runtimeHome: join(root, "runtime"),
      projectStateDirectory: join(root, "project", ".orchestrator"),
      defaultChromeProfileDirectories: [join(root, "chrome", "User Data")],
    });

    expect(profile).toBe(resolve(root, "runtime", "companion", "chrome-profile"));
    expect(() => companionProfileDirectory({
      runtimeHome: join(root, "project", ".orchestrator"),
      projectStateDirectory: join(root, "project", ".orchestrator"),
      defaultChromeProfileDirectories: [],
    })).toThrow("project state");
    expect(() => companionProfileDirectory({
      runtimeHome: join(root, "chrome", "User Data"),
      projectStateDirectory: join(root, "project", ".orchestrator"),
      defaultChromeProfileDirectories: [join(root, "chrome", "User Data")],
    })).toThrow("default Chrome profile");
  });

  it("takes over after Chrome expiry and drains before safe handback", async () => {
    let now = new Date("2026-09-04T00:00:00.000Z");
    const manager = new TransportManager(
      new TransportLeaseCoordinator(new InMemoryTransportLeaseStore(), () => now),
      1_000,
    );
    manager.register(new NoopTransport("chrome-extension"), 20);
    const driver = new FakePageDriver();
    const context = new FakeBrowserContext();
    const background = new BackgroundWebTransport({
      profileDir: resolve("C:/dedicated/asr-companion-profile"),
      manager,
      launchContext: async () => context,
      createPageDriver: () => driver,
      pollIntervalMs: 0,
      responseTimeoutMs: 1_000,
    });

    const chrome = await manager.acquire(binding.bindingId, "chrome-extension");
    await background.connect(binding);
    expect((await background.health()).status).toBe("STANDBY");

    now = new Date("2026-09-04T00:00:01.500Z");
    await background.connect(binding);
    const backgroundLease = background.currentLease();
    expect(backgroundLease?.epoch).toBe((chrome?.epoch ?? 0) + 1);
    expect((await background.health()).status).toBe("ACTIVE");

    now = new Date("2026-09-04T00:00:02.000Z");
    await background.connect(binding);
    expect(background.currentLease()?.epoch).toBe(backgroundLease?.epoch);

    await background.send({ messageId: "msg_request", bindingId: binding.bindingId, content: "request" }, { leaseEpoch: backgroundLease!.epoch });
    expect(await manager.acquire(binding.bindingId, "chrome-extension")).toBeUndefined();
    expect(manager.status(background.id)).toBe("DRAINING");
    await background.connect(binding);
    expect(manager.status(background.id)).toBe("DRAINING");

    driver.messages.push({
      id: "assistant-1",
      role: "assistant",
      content: JSON.stringify({ messageId: "msg_reply", inReplyTo: "msg_request", decision: "APPROVE" }),
    });
    await expect(background.waitForResponse({ bindingId: binding.bindingId, inReplyTo: "msg_request" }))
      .resolves.toMatchObject({ content: expect.stringContaining('"inReplyTo":"msg_request"') });

    const returnedChrome = await manager.acquire(binding.bindingId, "chrome-extension");
    expect(returnedChrome?.epoch).toBe(backgroundLease!.epoch + 1);
    expect(manager.status("chrome-extension")).toBe("ACTIVE");
    expect(manager.status(background.id)).toBe("STANDBY");
    expect(driver.submitted).toEqual(["request"]);
    expect(context.launchCount).toBe(1);
    await background.disconnect();
    expect((await background.health()).status).toBe("OFFLINE");
  });

  it("maps an expired ChatGPT session to AUTH_REQUIRED without changing lease logic", async () => {
    const manager = new TransportManager(new TransportLeaseCoordinator(new InMemoryTransportLeaseStore()));
    const driver = new FakePageDriver();
    const context = new FakeBrowserContext();
    const background = new BackgroundWebTransport({
      profileDir: resolve("C:/dedicated/asr-auth-profile"),
      manager,
      launchContext: async () => context,
      createPageDriver: () => driver,
    });
    await background.connect(binding);
    driver.compatible = false;
    context.page.setUrl("https://chatgpt.com/");

    await expect(background.health()).resolves.toEqual({ status: "OFFLINE", detail: "AUTH_REQUIRED" });
  });
});

const binding: ConversationBinding = {
  bindingId: "bind_companion",
  workspaceId: "workspace-1",
  conversationId: "conversation-1",
  conversationUrl: "https://chatgpt.com/c/conversation-1",
  preferredTransport: "background-web",
  createdAt: "2026-09-04T00:00:00.000Z",
};

class FakePageDriver implements ChatGptPageDriver {
  readonly messages: PageMessage[] = [];
  readonly submitted: string[] = [];
  compatible = true;
  async inspectConversation(): Promise<PageConversationIdentity> {
    return { conversationId: binding.conversationId, conversationUrl: binding.conversationUrl };
  }
  async submitMessage(message: string): Promise<SubmitReceipt> {
    this.submitted.push(message);
    return { messageId: `dom-${this.submitted.length}` };
  }
  async *observeMessages(_cursor?: MessageCursor): AsyncIterable<PageMessage> {
    yield* this.messages;
  }
  async detectGenerationState(): Promise<GenerationState> { return "IDLE"; }
  async health(): Promise<PageCompatibility> {
    return this.compatible
      ? { status: "COMPATIBLE", missing: [], conversationIdentity: true, composer: true, submit: true, assistantMessages: true, generationLifecycle: true }
      : { status: "INCOMPATIBLE", missing: ["conversationIdentity", "composer"], conversationIdentity: false, composer: false, submit: false, assistantMessages: false, generationLifecycle: false };
  }
}

class FakeBrowserContext implements CompanionBrowserContext {
  readonly page = new FakePage();
  launchCount = 0;
  pages(): CompanionPage[] { this.launchCount += 1; return [this.page]; }
  async newPage(): Promise<CompanionPage> { return this.page; }
  async close(): Promise<void> {}
}

class FakePage implements CompanionPage {
  #url = "about:blank";
  async goto(url: string): Promise<void> { this.#url = url; }
  url(): string { return this.#url; }
  setUrl(url: string): void { this.#url = url; }
}

class NoopTransport {
  constructor(readonly id: string) {}
  async connect(): Promise<void> {}
  async send(): Promise<void> {}
  async waitForResponse(): Promise<{ content: string }> { return { content: "" }; }
  async health(): Promise<{ status: "STANDBY" }> { return { status: "STANDBY" }; }
  async disconnect(): Promise<void> {}
}
