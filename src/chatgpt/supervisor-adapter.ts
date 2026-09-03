import { createHash, randomUUID } from "node:crypto";
import { ReviewSchema, type Review } from "../contracts/review.js";
import {
  SupervisorUnavailableError,
  type ReviewRequest,
  type SupervisorAdapter,
} from "../contracts/supervisor.js";
import { ConversationBindingSchema, type ConversationBinding } from "../conversations/binding.js";
import { MessageLedger } from "../conversations/message-ledger.js";
import { ConversationReconciler } from "../conversations/reconcile.js";
import type { ConversationTransport } from "../conversations/transport.js";
import { AsrEnvelopeSchema, SupervisorReplyEnvelopeSchema, type SupervisorReplyEnvelope } from "./contracts.js";

export type ChatGPTSupervisorAdapterOptions = {
  binding: ConversationBinding;
  transport: ConversationTransport;
  ledger: MessageLedger;
  leaseEpoch: () => number;
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
  readonly #messageId: () => string;
  readonly #nextSequence: () => number;

  constructor(options: ChatGPTSupervisorAdapterOptions) {
    this.#binding = ConversationBindingSchema.parse(options.binding);
    this.#transport = options.transport;
    this.#ledger = options.ledger;
    this.#reconciler = new ConversationReconciler(options.ledger);
    this.#leaseEpoch = options.leaseEpoch;
    this.#messageId = options.messageId ?? (() => `msg_${randomUUID()}`);
    if (options.nextSequence) {
      this.#nextSequence = options.nextSequence;
    } else {
      let sequence = 0;
      this.#nextSequence = () => sequence++;
    }
  }

  async requestReview(input: ReviewRequest): Promise<Review> {
    const messageId = this.#messageId();
    const envelope = AsrEnvelopeSchema.parse({
      protocolVersion: "ASR/1",
      messageId,
      bindingId: this.#binding.bindingId,
      taskId: input.task.taskId,
      runId: input.result.runId,
      kind: "REVIEW_REQUEST",
      sequence: this.#nextSequence(),
    });
    const content = JSON.stringify({
      ...envelope,
      payload: {
        task: input.task,
        result: input.result,
        previousReview: input.previousReview,
        revisionNumber: input.revisionNumber,
      },
    });

    await this.#ledger.append({
      messageId,
      bindingId: envelope.bindingId,
      taskId: envelope.taskId,
      runId: envelope.runId,
      kind: envelope.kind,
      direction: "outbound",
      sequence: envelope.sequence,
      payloadHash: sha256(content),
    });
    await this.#ledger.transition(messageId, "CLAIMED");

    try {
      await this.#transport.connect(this.#binding);
      await this.#transport.send(
        { messageId, bindingId: this.#binding.bindingId, content },
        { leaseEpoch: this.#leaseEpoch() },
      );
      await this.#ledger.transition(messageId, "SENT");
    } catch (error) {
      const current = await this.#ledger.get(messageId);
      if (current?.state === "CLAIMED") await this.#ledger.transition(messageId, "PENDING");
      throw new SupervisorUnavailableError("ChatGPT supervisor transport is unavailable", { cause: error });
    }

    let responseContent: string;
    try {
      responseContent = (await this.#transport.waitForResponse({
        bindingId: this.#binding.bindingId,
        inReplyTo: messageId,
      })).content;
    } catch (error) {
      throw new SupervisorUnavailableError("ChatGPT supervisor response is unavailable", { cause: error });
    }

    const reply = parseReply(responseContent);
    assertReplyCorrelation(reply, envelope);

    await this.#reconciler.reconcile(this.#binding.bindingId, [
      {
        type: "request",
        messageId,
        bindingId: envelope.bindingId,
        taskId: envelope.taskId,
        runId: envelope.runId,
      },
      {
        type: "response",
        messageId: reply.messageId,
        inReplyTo: reply.inReplyTo,
        bindingId: reply.bindingId,
        taskId: reply.taskId,
        runId: reply.runId,
        content: responseContent,
      },
    ]);
    await this.#ledger.transition(messageId, "CONSUMED");

    return toReview(reply);
  }
}

function parseReply(content: string): SupervisorReplyEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Supervisor reply is not valid JSON");
  }
  return SupervisorReplyEnvelopeSchema.parse(parsed);
}

function assertReplyCorrelation(
  reply: SupervisorReplyEnvelope,
  request: { bindingId: string; taskId: string; runId: string; messageId: string },
): void {
  if (
    reply.bindingId !== request.bindingId ||
    reply.taskId !== request.taskId ||
    reply.runId !== request.runId ||
    reply.inReplyTo !== request.messageId
  ) {
    throw new Error("Supervisor reply correlation mismatch");
  }
}

function toReview(reply: SupervisorReplyEnvelope): Review {
  if ((reply.decision === "REVISE" || reply.decision === "ASK_USER") && !reply.instruction) {
    throw new Error(`${reply.decision} reply requires instruction`);
  }

  return ReviewSchema.parse({
    taskId: reply.taskId,
    runId: reply.runId,
    decision: reply.decision,
    summary: reply.findings[0] ?? `Supervisor decision: ${reply.decision}`,
    findings: reply.findings.map((message) => ({
      severity: "major",
      category: "supervisor",
      message,
    })),
    revisionInstructions: reply.decision === "REVISE" ? [reply.instruction!] : undefined,
    userQuestion: reply.decision === "ASK_USER" ? reply.instruction : undefined,
  });
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
