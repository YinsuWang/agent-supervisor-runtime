import {
  TransportLeaseCoordinator,
  TransportLeaseError,
  type TransportLease,
} from "./lease.js";
import type { ConversationTransport, TransportStatus } from "./transport.js";

type Registration = {
  transport: ConversationTransport;
  priority: number;
  status: TransportStatus;
  exchangeInFlight: boolean;
};

export class TransportManager {
  readonly #registrations = new Map<string, Registration>();

  constructor(
    private readonly leases: TransportLeaseCoordinator,
    private readonly defaultTtlMs = 15_000,
  ) {}

  register(transport: ConversationTransport, priority: number): void {
    if (!Number.isFinite(priority)) throw new Error("Transport priority must be finite");
    this.#registrations.set(transport.id, {
      transport,
      priority,
      status: "STANDBY",
      exchangeInFlight: false,
    });
  }

  status(holder: string): TransportStatus | undefined {
    return this.#registrations.get(holder)?.status;
  }

  setExchangeInFlight(holder: string, value: boolean): void {
    const registration = this.requireRegistration(holder);
    registration.exchangeInFlight = value;
  }

  async acquire(bindingId: string, holder: string, ttlMs = this.defaultTtlMs): Promise<TransportLease | undefined> {
    const requester = this.requireRegistration(holder);
    const current = await this.leases.current(bindingId);

    if (!current || new Date(current.expiresAt).getTime() <= Date.now()) {
      const lease = await this.leases.acquire(bindingId, holder, ttlMs);
      requester.status = "ACTIVE";
      this.markOthersStandby(holder);
      return lease;
    }

    if (current.holder === holder) {
      requester.status = "ACTIVE";
      return current;
    }

    const active = this.requireRegistration(current.holder);
    if (requester.priority <= active.priority) {
      throw new TransportLeaseError("LEASE_HELD", `Higher-priority holder ${current.holder} remains active`);
    }

    active.status = "DRAINING";
    if (active.exchangeInFlight) return undefined;

    await this.leases.release(bindingId, current.holder, current.epoch);
    active.status = "STANDBY";
    const lease = await this.leases.acquire(bindingId, holder, ttlMs);
    requester.status = "ACTIVE";
    this.markOthersStandby(holder);
    return lease;
  }

  async renew(bindingId: string, holder: string, epoch: number, ttlMs = this.defaultTtlMs): Promise<TransportLease> {
    const registration = this.requireRegistration(holder);
    const lease = await this.leases.renew(bindingId, holder, epoch, ttlMs);
    registration.status = "ACTIVE";
    return lease;
  }

  beginDrain(holder: string): void {
    this.requireRegistration(holder).status = "DRAINING";
  }

  async release(bindingId: string, holder: string, epoch: number): Promise<void> {
    await this.leases.release(bindingId, holder, epoch);
    this.requireRegistration(holder).status = "STANDBY";
  }

  async assertSendAuthority(bindingId: string, holder: string, epoch: number): Promise<void> {
    const registration = this.requireRegistration(holder);
    if (registration.status !== "ACTIVE") {
      throw new TransportLeaseError("STALE_LEASE", `${holder} is not ACTIVE`);
    }
    await this.leases.assertAuthority(bindingId, holder, epoch);
  }

  private requireRegistration(holder: string): Registration {
    const registration = this.#registrations.get(holder);
    if (!registration) throw new Error(`Transport is not registered: ${holder}`);
    return registration;
  }

  private markOthersStandby(activeHolder: string): void {
    for (const [holder, registration] of this.#registrations) {
      if (holder !== activeHolder && registration.status !== "OFFLINE") registration.status = "STANDBY";
    }
  }
}
