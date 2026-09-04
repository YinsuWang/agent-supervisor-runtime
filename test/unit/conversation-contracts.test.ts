import { describe, expect, it } from "vitest";
import { ConversationBindingSchema } from "../../src/conversations/binding.js";
import { AsrEnvelopeSchema, SupervisorReplyEnvelopeSchema } from "../../src/chatgpt/contracts.js";

describe("conversation contracts", () => {
  it("rejects a binding without an explicit conversation id", () => {
    expect(() => ConversationBindingSchema.parse({
      bindingId: "bind_1",
      workspaceId: "ws_1",
      conversationUrl: "https://chatgpt.com/c/abc",
      preferredTransport: "chrome-extension",
      createdAt: new Date().toISOString(),
    })).toThrow();
  });

  it("accepts an explicit binding", () => {
    expect(ConversationBindingSchema.parse({
      bindingId: "bind_1",
      workspaceId: "ws_1",
      conversationId: "abc",
      conversationUrl: "https://chatgpt.com/c/abc",
      preferredTransport: "chrome-extension",
      createdAt: new Date().toISOString(),
    }).conversationId).toBe("abc");
  });

  it("requires strict reply correlation", () => {
    expect(() => SupervisorReplyEnvelopeSchema.parse({
      protocolVersion: "ASR/1",
      messageId: "msg_2",
      bindingId: "bind_1",
      taskId: "task_1",
      runId: "run_1",
      kind: "REVIEW",
      decision: "PASS",
    })).toThrow();
  });

  it("accepts a correlated review reply", () => {
    const reply = SupervisorReplyEnvelopeSchema.parse({
      protocolVersion: "ASR/1",
      messageId: "msg_2",
      inReplyTo: "msg_1",
      bindingId: "bind_1",
      taskId: "task_1",
      runId: "run_1",
      kind: "REVIEW",
      decision: "PASS",
    });

    expect(reply.inReplyTo).toBe("msg_1");
    expect(reply.findings).toEqual([]);
  });

  it("requires run-scoped identity on generic ASR envelopes", () => {
    expect(() => AsrEnvelopeSchema.parse({
      protocolVersion: "ASR/1",
      messageId: "msg_1",
      bindingId: "bind_1",
      taskId: "task_1",
      kind: "REVIEW_REQUEST",
      sequence: 1,
    })).toThrow();
  });
});
