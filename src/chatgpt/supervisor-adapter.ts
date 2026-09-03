import { createHash, randomUUID } from "node:crypto";
import { ReviewSchema, type Review } from "../contracts/review.js";
import { SupervisorUnavailableError, type ReviewRequest, type SupervisorAdapter } from "../contracts/supervisor.js";
import { ConversationBindingSchema, type ConversationBinding } from "../conversations/binding.js";
import { MessageLedger } from "../conversations/message-ledger.js";
import { ConversationReconciler } from "../conversations/reconcile.js";
import type { ConversationTransport } from "../conversations/transport.js";
import { ContextBroker } from "../context/broker.js";
import { ContextBrokerError, type ContextManifest } from "../context/contracts.js";
import {
  AsrEnvelopeSchema,
  ContextRequestEnvelopeSchema,
  ContextResponseEnvelopeSchema,
  SupervisorReplyEnvelopeSchema,
  type AsrEnvelope,
  type ContextRequestEnvelope,
  type SupervisorReplyEnvelope,
} from "./contracts.js";
import { compileReviewPacket } from "./review-packet.js";

export type ChatGPTSupervisorAdapterOptions = {
  binding: ConversationBinding;
  transport: ConversationTransport;
  ledger: MessageLedger;
  leaseEpoch: () => number;
  contextBroker?: ContextBroker;
  messageId?: () => string;
  nextSequence?: () => number;
};

export class ChatGPTSupervisorAdapter implements SupervisorAdapter {
  readonly name = "chatgpt";
  readonly #binding: ConversationBinding;
  readonly #transport: ConversationTransport;
  readonly #ledger: MessageLedger;
  readonly #reconciler: ConversationReconciler;
  readonly #leaseEpoch: () => number;
  readonly #contextBroker?: ContextBroker;
  readonly #messageId: () => string;
  readonly #nextSequence: () => number;

  constructor(options: ChatGPTSupervisorAdapterOptions) {
    this.#binding = ConversationBindingSchema.parse(options.binding);
    this.#transport = options.transport;
    this.#ledger = options.ledger;
    this.#reconciler = new ConversationReconciler(options.ledger);
    this.#leaseEpoch = options.leaseEpoch;
    this.#contextBroker = options.contextBroker;
    this.#messageId = options.messageId ?? (() => `msg_${randomUUID()}`);
    if (options.nextSequence) this.#nextSequence = options.nextSequence;
    else { let sequence = 0; this.#nextSequence = () => sequence++; }
  }

  async requestReview(input: ReviewRequest): Promise<Review> {
    const existing = (await this.#ledger.findPendingForBinding(this.#binding.bindingId)).find((entry) =>
      entry.taskId === input.task.taskId && entry.runId === input.result.runId && entry.kind === "REVIEW_REQUEST" && entry.direction === "outbound",
    );

    let manifest: ContextManifest = {
      bindingId: this.#binding.bindingId,
      taskId: input.task.taskId,
      runId: input.result.runId,
      available: [],
    };
    if (this.#contextBroker) {
      manifest = await this.#contextBroker.createManifest({
        bindingId: this.#binding.bindingId,
        taskId: input.task.taskId,
        runId: input.result.runId,
        workspaceRoot: input.task.execution.workingDirectory,
      });
    }

    const envelope = AsrEnvelopeSchema.parse({
      protocolVersion: "ASR/1",
      messageId: existing?.messageId ?? this.#messageId(),
      bindingId: this.#binding.bindingId,
      taskId: input.task.taskId,
      runId: input.result.runId,
      kind: "REVIEW_REQUEST",
      sequence: existing?.sequence ?? this.#nextSequence(),
    });
    const content = JSON.stringify({ ...envelope, payload: compileReviewPacket(input.task, input.result, manifest) });

    if (!existing) {
      await this.#ledger.append({
        messageId: envelope.messageId, bindingId: envelope.bindingId, taskId: envelope.taskId, runId: envelope.runId,
        kind: envelope.kind, direction: "outbound", sequence: envelope.sequence, payloadHash: sha256(content),
      });
    } else if (existing.payloadHash !== sha256(content)) throw new Error(`Persisted review request payload mismatch: ${existing.messageId}`);

    const current = existing ?? (await this.#ledger.get(envelope.messageId))!;
    if (current.state === "CLAIMED") throw new SupervisorUnavailableError(`Review request ${current.messageId} has ambiguous CLAIMED delivery state and requires reconciliation`);
    if (current.state === "PENDING") await this.sendPending(envelope.messageId, content);
    return this.reviewLoop(envelope);
  }

  private async reviewLoop(initialRequest: AsrEnvelope): Promise<Review> {
    let outbound = initialRequest;
    while (true) {
      const responseContent = await this.waitRaw(outbound.messageId);
      const parsed = parseJson(responseContent);
      if (isReview(parsed)) {
        const reply = SupervisorReplyEnvelopeSchema.parse(parsed);
        assertCorrelation(reply, outbound);
        await this.consumeExchange(outbound, reply.messageId, reply.inReplyTo, responseContent, "REVIEW");
        return toReview(reply);
      }

      const request = ContextRequestEnvelopeSchema.parse(parsed);
      assertCorrelation(request, outbound);
      await this.consumeExchange(outbound, request.messageId, request.inReplyTo, responseContent, "CONTEXT_REQUEST");
      outbound = await this.respondToContextRequest(request);
    }
  }

  private async respondToContextRequest(request: ContextRequestEnvelope): Promise<AsrEnvelope> {
    let payload: unknown;
    if (!this.#contextBroker) {
      payload = { error: { code: "CONTEXT_CAPABILITY_UNAVAILABLE", message: "Context Broker is not configured" } };
    } else {
      try {
        payload = await this.#contextBroker.fetch({
          bindingId: request.bindingId, taskId: request.taskId, runId: request.runId,
          ref: request.ref, query: request.query, continuation: request.continuation,
        });
      } catch (error) {
        if (!(error instanceof ContextBrokerError)) throw error;
        payload = { error: { code: error.code, message: error.message } };
      }
    }

    const envelope = ContextResponseEnvelopeSchema.parse({
      protocolVersion: "ASR/1",
      messageId: this.#messageId(),
      bindingId: request.bindingId,
      taskId: request.taskId,
      runId: request.runId,
      kind: "CONTEXT_RESPONSE",
      sequence: this.#nextSequence(),
      correlationId: request.messageId,
      payload,
    });
    const content = JSON.stringify(envelope);
    await this.#ledger.append({
      messageId: envelope.messageId, bindingId: envelope.bindingId, taskId: envelope.taskId, runId: envelope.runId,
      kind: envelope.kind, direction: "outbound", sequence: envelope.sequence, correlationId: envelope.correlationId, payloadHash: sha256(content),
    });
    await this.sendPending(envelope.messageId, content);
    return envelope;
  }

  private async sendPending(messageId: string, content: string): Promise<void> {
    await this.#ledger.transition(messageId, "CLAIMED");
    try {
      await this.#transport.connect(this.#binding);
      await this.#transport.send({ messageId, bindingId: this.#binding.bindingId, content }, { leaseEpoch: this.#leaseEpoch() });
      await this.#ledger.transition(messageId, "SENT");
    } catch (error) {
      const current = await this.#ledger.get(messageId);
      if (current?.state === "CLAIMED") await this.#ledger.transition(messageId, "PENDING");
      throw new SupervisorUnavailableError("ChatGPT supervisor transport is unavailable", { cause: error });
    }
  }

  private async waitRaw(inReplyTo: string): Promise<string> {
    try {
      await this.#transport.connect(this.#binding);
      return (await this.#transport.waitForResponse({ bindingId: this.#binding.bindingId, inReplyTo })).content;
    } catch (error) {
      throw new SupervisorUnavailableError("ChatGPT supervisor response is unavailable", { cause: error });
    }
  }

  private async consumeExchange(
    outbound: AsrEnvelope,
    inboundMessageId: string,
    inReplyTo: string,
    responseContent: string,
    inboundKind: string,
  ): Promise<void> {
    await this.#reconciler.reconcile(this.#binding.bindingId, [
      { type: "request", messageId: outbound.messageId, bindingId: outbound.bindingId, taskId: outbound.taskId, runId: outbound.runId },
      { type: "response", messageId: inboundMessageId, inReplyTo, bindingId: outbound.bindingId, taskId: outbound.taskId, runId: outbound.runId, content: responseContent },
    ]);
    const state = await this.#ledger.get(outbound.messageId);
    if (state?.state === "RESPONDED") await this.#ledger.transition(outbound.messageId, "CONSUMED");
    else if (state?.state !== "CONSUMED") throw new Error(`Supervisor exchange did not reconcile: ${outbound.messageId}`);

    await this.#ledger.recordInboundConsumed({
      messageId: inboundMessageId, bindingId: outbound.bindingId, taskId: outbound.taskId, runId: outbound.runId,
      kind: inboundKind, direction: "inbound", sequence: this.#nextSequence(), correlationId: inReplyTo, payloadHash: sha256(responseContent),
    });
  }
}

function parseJson(content: string): unknown { try { return JSON.parse(content); } catch { throw new Error("Supervisor reply is not valid JSON"); } }
function isReview(value: unknown): boolean { return typeof value === "object" && value !== null && (value as Record<string, unknown>).kind === "REVIEW"; }
function assertCorrelation(reply: { bindingId: string; taskId: string; runId: string; inReplyTo: string }, request: { bindingId: string; taskId: string; runId: string; messageId: string }): void {
  if (reply.bindingId !== request.bindingId || reply.taskId !== request.taskId || reply.runId !== request.runId || reply.inReplyTo !== request.messageId) throw new Error("Supervisor reply correlation mismatch");
}
function toReview(reply: SupervisorReplyEnvelope): Review {
  if ((reply.decision === "REVISE" || reply.decision === "ASK_USER") && !reply.instruction) throw new Error(`${reply.decision} reply requires instruction`);
  return ReviewSchema.parse({ taskId: reply.taskId, runId: reply.runId, decision: reply.decision, summary: reply.findings[0] ?? `Supervisor decision: ${reply.decision}`,
    findings: reply.findings.map((message) => ({ severity: "major", category: "supervisor", message })),
    revisionInstructions: reply.decision === "REVISE" ? [reply.instruction!] : undefined,
    userQuestion: reply.decision === "ASK_USER" ? reply.instruction : undefined });
}
function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
