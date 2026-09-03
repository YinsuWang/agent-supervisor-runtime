import { z } from "zod";

export const TransportLeaseSchema = z.object({
  bindingId: z.string().min(1),
  holder: z.string().min(1),
  epoch: z.number().int().positive(),
  expiresAt: z.string().datetime(),
});

export type TransportLease = z.infer<typeof TransportLeaseSchema>;

export interface TransportLeaseStore {
  load(bindingId: string): Promise<TransportLease | undefined>;
  save(lease: TransportLease): Promise<void>;
}

export class InMemoryTransportLeaseStore implements TransportLeaseStore {
  readonly #leases = new Map<string, TransportLease>();

  async load(bindingId: string): Promise<TransportLease | undefined> {
    const lease = this.#leases.get(bindingId);
    return lease ? { ...lease } : undefined;
  }

  async save(lease: TransportLease): Promise<void> {
    const parsed = TransportLeaseSchema.parse(lease);
    this.#leases.set(parsed.bindingId, { ...parsed });
  }
}

export type Clock = () => Date;

export class TransportLeaseError extends Error {
  constructor(readonly code: "LEASE_HELD" | "STALE_LEASE", message: string) {
    super(message);
    this.name = "TransportLeaseError";
  }
}

export class TransportLeaseCoordinator {
  constructor(
    private readonly store: TransportLeaseStore,
    private readonly clock: Clock = () => new Date(),
  ) {}

  async current(bindingId: string): Promise<TransportLease | undefined> {
    return this.store.load(bindingId);
  }

  async acquire(bindingId: string, holder: string, ttlMs: number): Promise<TransportLease> {
    assertPositiveTtl(ttlMs);
    const existing = await this.store.load(bindingId);
    const now = this.clock();

    if (existing && !isExpired(existing, now)) {
      if (existing.holder !== holder) {
        throw new TransportLeaseError("LEASE_HELD", `Binding ${bindingId} is held by ${existing.holder}`);
      }
      return existing;
    }

    const lease = TransportLeaseSchema.parse({
      bindingId,
      holder,
      epoch: (existing?.epoch ?? 0) + 1,
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    });
    await this.store.save(lease);
    return lease;
  }

  async renew(bindingId: string, holder: string, epoch: number, ttlMs: number): Promise<TransportLease> {
    assertPositiveTtl(ttlMs);
    const existing = await this.assertAuthority(bindingId, holder, epoch);
    const renewed = {
      ...existing,
      expiresAt: new Date(this.clock().getTime() + ttlMs).toISOString(),
    };
    await this.store.save(renewed);
    return renewed;
  }

  async release(bindingId: string, holder: string, epoch: number): Promise<void> {
    const existing = await this.assertAuthority(bindingId, holder, epoch);
    await this.store.save({ ...existing, expiresAt: this.clock().toISOString() });
  }

  async assertAuthority(bindingId: string, holder: string, epoch: number): Promise<TransportLease> {
    const existing = await this.store.load(bindingId);
    const now = this.clock();
    if (
      !existing ||
      existing.holder !== holder ||
      existing.epoch !== epoch ||
      isExpired(existing, now)
    ) {
      throw new TransportLeaseError("STALE_LEASE", `Stale lease for ${bindingId}: ${holder}@${epoch}`);
    }
    return existing;
  }
}

function isExpired(lease: TransportLease, now: Date): boolean {
  return new Date(lease.expiresAt).getTime() <= now.getTime();
}

function assertPositiveTtl(ttlMs: number): void {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error("Lease TTL must be positive");
}
