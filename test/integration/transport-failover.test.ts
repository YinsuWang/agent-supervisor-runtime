import { describe, expect, it } from "vitest";
import { InMemoryTransportLeaseStore, TransportLeaseCoordinator } from "../../src/conversations/lease.js";
import { TransportManager } from "../../src/conversations/transport-manager.js";
import type {
  ConversationTransport,
  ResponseRequest,
  TransportHealth,
  TransportMessage,
  TransportResponse,
  TransportSendContext,
} from "../../src/conversations/transport.js";
import type { ConversationBinding } from "../../src/conversations/binding.js";

class FakeTransport implements ConversationTransport {
  constructor(readonly id: string) {}
  async connect(_binding: ConversationBinding): Promise<void> {}
  async send(_message: TransportMessage, _context: TransportSendContext): Promise<void> {}
  async waitForResponse(_request: ResponseRequest): Promise<TransportResponse> {
    return { content: "" };
  }
  async health(): Promise<TransportHealth> {
    return { status: "STANDBY" };
  }
  async disconnect(): Promise<void> {}
}

describe("transport failover", () => {
  it("fails over after expiry and rejects the stale epoch", async () => {
    let now = new Date("2026-01-01T00:00:00.000Z");
    const coordinator = new TransportLeaseCoordinator(new InMemoryTransportLeaseStore(), () => now);
    const manager = new TransportManager(coordinator, 1_000);
    manager.register(new FakeTransport("chrome"), 20);
    manager.register(new FakeTransport("background"), 10);

    const chrome = await manager.acquire("bind_1", "chrome");
    expect(chrome?.epoch).toBe(1);

    now = new Date("2026-01-01T00:00:01.500Z");
    const background = await manager.acquire("bind_1", "background");
    expect(background?.epoch).toBe(2);
    expect(manager.status("background")).toBe("ACTIVE");

    await expect(manager.assertSendAuthority("bind_1", "chrome", chrome!.epoch)).rejects.toMatchObject({
      code: "STALE_LEASE",
    });
  });

  it("drains an in-flight lower-priority holder before safe handoff", async () => {
    const coordinator = new TransportLeaseCoordinator(new InMemoryTransportLeaseStore());
    const manager = new TransportManager(coordinator, 30_000);
    manager.register(new FakeTransport("background"), 10);
    manager.register(new FakeTransport("chrome"), 20);

    const background = await manager.acquire("bind_1", "background");
    manager.setExchangeInFlight("background", true);

    expect(await manager.acquire("bind_1", "chrome")).toBeUndefined();
    expect(manager.status("background")).toBe("DRAINING");

    manager.setExchangeInFlight("background", false);
    const chrome = await manager.acquire("bind_1", "chrome");
    expect(chrome?.epoch).toBe((background?.epoch ?? 0) + 1);
    expect(manager.status("chrome")).toBe("ACTIVE");
    expect(manager.status("background")).toBe("STANDBY");
  });
});
