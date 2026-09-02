import { describe, expect, it } from "vitest";
import { transition } from "../../src/core/state-machine.js";

describe("state machine", () => {
  it("runs the success path", () => {
    let state = transition("CREATED", "VALIDATE");
    state = transition(state, "DISPATCH");
    state = transition(state, "START");
    state = transition(state, "WORKER_SUCCEEDED");
    state = transition(state, "REQUEST_REVIEW");
    state = transition(state, "REVIEW_PASS");
    expect(state).toBe("COMPLETED");
  });

  it("separates retry from revision", () => {
    expect(transition("RUNNING", "WORKER_RETRY")).toBe("RETRY_READY");
    expect(transition("REVIEWING", "REVIEW_REVISE")).toBe("REVISION_READY");
  });

  it("allows a blocked task to be explicitly resumed", () => {
    expect(transition("BLOCKED", "USER_RESOLVED")).toBe("READY");
  });

  it("rejects invalid transitions", () => {
    expect(() => transition("COMPLETED", "DISPATCH")).toThrow(/Invalid transition/);
  });
});
