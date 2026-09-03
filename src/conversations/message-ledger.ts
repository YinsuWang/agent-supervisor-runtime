import { z } from "zod";
import type { StateStore } from "../contracts/state-store.js";

export const MessageStateSchema = z.enum([
  "PENDING",
  "CLAIMED",
  "SENT",
  "OBSERVED",
  "RESPONDED",
  "CONSUMED",
]);

export type MessageState = z.infer<typeof MessageStateSchema>;

export const MessageLedgerEntrySchema = z.object({
  messageId: z.string().min(1),
  bindingId: z.string().min(1),
  taskId: z.string().min(1),
  runId: z.string().min(1),
  kind: z.string().min(1),
  direction: z.enum(["outbound", "inbound"]),
  sequence: z.number().int().nonnegative(),
  correlationId: z.string().min(1).optional(),
  payloadHash: z.string().min(1),
  state: MessageStateSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type MessageLedgerEntry = z.infer<typeof MessageLedgerEntrySchema>;
export type NewMessageLedgerEntry = Omit<MessageLedgerEntry, "state" | "createdAt" | "updatedAt">;

const allowed: Record<MessageState, readonly MessageState[]> = {
  PENDING: ["CLAIMED"],
  CLAIMED: ["PENDING", "SENT"],
  SENT: ["OBSERVED"],
  OBSERVED: ["RESPONDED"],
  RESPONDED: ["CONSUMED"],
  CONSUMED: [],
};

export class MessageLedger {
  constructor(
    private readonly store: StateStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async append(input: NewMessageLedgerEntry): Promise<MessageLedgerEntry> {
    const existing = await this.store.loadMessageRecord(input.messageId);
    if (existing) {
      if (!sameImmutableMessage(existing, input)) {
        throw new Error(`Conflicting reuse of messageId: ${input.messageId}`);
      }
      return existing;
    }

    const timestamp = this.now().toISOString();
    const entry = MessageLedgerEntrySchema.parse({
      ...input,
      state: "PENDING",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await this.store.saveMessageRecord(entry);
    return entry;
  }

  async transition(messageId: string, next: MessageState): Promise<MessageLedgerEntry> {
    const current = await this.store.loadMessageRecord(messageId);
    if (!current) throw new Error(`Unknown messageId: ${messageId}`);
    if (!allowed[current.state].includes(next)) {
      throw new Error(`Invalid message transition: ${current.state} -> ${next}`);
    }

    const updated = MessageLedgerEntrySchema.parse({
      ...current,
      state: next,
      updatedAt: this.now().toISOString(),
    });
    await this.store.saveMessageRecord(updated);
    return updated;
  }

  async get(messageId: string): Promise<MessageLedgerEntry | undefined> {
    return this.store.loadMessageRecord(messageId);
  }

  async findPendingForBinding(bindingId: string): Promise<MessageLedgerEntry[]> {
    const records = await this.store.listMessageRecords();
    return records
      .filter((record) => record.bindingId === bindingId && record.state !== "CONSUMED")
      .sort((a, b) => a.sequence - b.sequence || a.createdAt.localeCompare(b.createdAt));
  }
}

function sameImmutableMessage(existing: MessageLedgerEntry, input: NewMessageLedgerEntry): boolean {
  return (
    existing.messageId === input.messageId &&
    existing.bindingId === input.bindingId &&
    existing.taskId === input.taskId &&
    existing.runId === input.runId &&
    existing.kind === input.kind &&
    existing.direction === input.direction &&
    existing.sequence === input.sequence &&
    existing.correlationId === input.correlationId &&
    existing.payloadHash === input.payloadHash
  );
}
