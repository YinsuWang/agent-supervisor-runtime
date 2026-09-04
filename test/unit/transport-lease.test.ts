import { describe, expect, it } from "vitest";
import {
  InMemoryTransportLeaseStore,
  TransportLeaseCoordinator,
  TransportLeaseError,
} from "../../src/conversations/lease.js";

describe("transport lease", () => {
  it("allows only one live holder and fences an expired epoch", async () => {
    let now = new Date("2026-01-01T00:00:00.000Z");
    const leases = new TransportLeaseCoordinator(
      new InMemoryTransportLeaseStore(),
      () => now,
    );

    const chrome = await leases.acquire("bind_1", "chrome", 1_000);
    expect(chrome.epoch).toBe(1);

    await expect(leases.acquire("bind_1", "background", 1_000)).rejects.toMatchObject({
      code: "LEASE_HELD",
    } satisfies Partial<TransportLeaseError>);

    now = new Date("2026-01-01T00:00:01.500Z");
    const background = await leases.acquire("bind_1", "background", 1_000);
    expect(background.epoch).toBe(2);

    await expect(leases.assertAuthority("bind_1", "chrome", chrome.epoch)).rejects.toMatchObject({
      code: "STALE_LEASE",
    } satisfies Partial<TransportLeaseError>);
  });

  it("renews only the current fenced holder", async () => {
    let now = new Date("2026-01-01T00:00:00.000Z");
    const leases = new TransportLeaseCoordinator(new InMemoryTransportLeaseStore(), () => now);
    const lease = await leases.acquire("bind_1", "chrome", 1_000);

    now = new Date("2026-01-01T00:00:00.500Z");
    const renewed = await leases.renew("bind_1", "chrome", lease.epoch, 2_000);
    expect(renewed.epoch).toBe(lease.epoch);
    expect(renewed.expiresAt).toBe("2026-01-01T00:00:02.500Z");

    await expect(leases.renew("bind_1", "chrome", lease.epoch + 1, 2_000)).rejects.toMatchObject({
      code: "STALE_LEASE",
    });
  });
});
