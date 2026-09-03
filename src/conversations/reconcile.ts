import type { MessageLedger, MessageLedgerEntry } from "./message-ledger.js";

export type ConversationObservation = {
  type: "request" | "response";
  messageId: string;
  bindingId: string;
  taskId: string;
  runId: string;
  inReplyTo?: string;
  content?: string;
};

export class ConversationReconciler {
  constructor(private readonly ledger: MessageLedger) {}

  async reconcile(bindingId: string, observations: readonly ConversationObservation[]): Promise<ConversationObservation[]> {
    const pending = await this.ledger.findPendingForBinding(bindingId);
    const responses: ConversationObservation[] = [];

    for (const entry of pending) {
      let current = entry;
      const requestObserved = observations.some((observation) => matchesRequest(entry, observation));
      const response = observations.find((observation) => matchesResponse(entry, observation));

      if (current.state === "SENT" && (requestObserved || response)) {
        current = await this.ledger.transition(entry.messageId, "OBSERVED");
      }
      if (current.state === "OBSERVED" && response) {
        await this.ledger.transition(entry.messageId, "RESPONDED");
        responses.push(response);
      }
    }

    return responses;
  }
}

function matchesIdentity(entry: MessageLedgerEntry, observation: ConversationObservation): boolean {
  return (
    observation.bindingId === entry.bindingId &&
    observation.taskId === entry.taskId &&
    observation.runId === entry.runId
  );
}

function matchesRequest(entry: MessageLedgerEntry, observation: ConversationObservation): boolean {
  return observation.type === "request" && observation.messageId === entry.messageId && matchesIdentity(entry, observation);
}

function matchesResponse(entry: MessageLedgerEntry, observation: ConversationObservation): boolean {
  return (
    observation.type === "response" &&
    observation.inReplyTo === entry.messageId &&
    matchesIdentity(entry, observation)
  );
}
