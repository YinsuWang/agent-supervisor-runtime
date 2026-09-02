import type { RunState } from "../contracts/state.js";
import { InvalidTransitionError } from "./errors.js";

export type StateEvent =
  | "VALIDATE"
  | "DISPATCH"
  | "START"
  | "WORKER_SUCCEEDED"
  | "WORKER_RETRY"
  | "WORKER_FAILED"
  | "REQUEST_REVIEW"
  | "REVIEW_PASS"
  | "REVIEW_REVISE"
  | "BLOCK"
  | "USER_RESOLVED";

const transitions: Record<RunState, Partial<Record<StateEvent, RunState>>> = {
  CREATED: { VALIDATE: "READY", BLOCK: "BLOCKED" },
  READY: { DISPATCH: "DISPATCHED", BLOCK: "BLOCKED" },
  DISPATCHED: { START: "RUNNING", BLOCK: "BLOCKED" },
  RUNNING: {
    WORKER_SUCCEEDED: "RESULT_READY",
    WORKER_RETRY: "RETRY_READY",
    WORKER_FAILED: "FAILED",
    BLOCK: "BLOCKED"
  },
  RETRY_READY: { DISPATCH: "DISPATCHED", BLOCK: "BLOCKED" },
  RESULT_READY: { REQUEST_REVIEW: "REVIEWING", BLOCK: "BLOCKED" },
  REVIEWING: {
    REVIEW_PASS: "COMPLETED",
    REVIEW_REVISE: "REVISION_READY",
    BLOCK: "BLOCKED"
  },
  REVISION_READY: { DISPATCH: "DISPATCHED", BLOCK: "BLOCKED" },
  COMPLETED: {},
  BLOCKED: { USER_RESOLVED: "READY" },
  FAILED: {}
};

export function transition(current: RunState, event: StateEvent): RunState {
  const next = transitions[current][event];
  if (!next) throw new InvalidTransitionError(current, event);
  return next;
}
