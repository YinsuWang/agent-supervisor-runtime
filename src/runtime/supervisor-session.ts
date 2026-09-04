import { z } from "zod";
import { RunStateSchema, type RunState } from "../contracts/state.js";

export const SupervisorSessionStateSchema = z.enum([
  "OFFLINE",
  "CONNECTING",
  "AUTH_REQUIRED",
  "RECONCILING",
  "STANDBY",
  "ACTIVE",
  "DEGRADED",
  "INCOMPATIBLE",
]);

export type SupervisorSessionState = z.infer<typeof SupervisorSessionStateSchema>;

export const SupervisorConnectivityEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("CONNECT_REQUESTED") }),
  z.object({ type: z.literal("CHROME_CLOSED") }),
  z.object({ type: z.literal("LOGIN_EXPIRED") }),
  z.object({ type: z.literal("DOM_INCOMPATIBLE") }),
  z.object({ type: z.literal("NATIVE_HOST_CRASHED") }),
  z.object({ type: z.literal("RUNTIME_RESTARTED") }),
  z.object({ type: z.literal("RECONCILED") }),
  z.object({ type: z.literal("LEASE_STANDBY") }),
  z.object({ type: z.literal("LEASE_ACTIVE") }),
  z.object({ type: z.literal("TRANSPORT_DEGRADED") }),
]);

export type SupervisorConnectivityEvent = z.infer<typeof SupervisorConnectivityEventSchema>;

export type SupervisorSession = {
  state: SupervisorSessionState;
  taskState: RunState;
};

export function createSupervisorSession(
  taskState: RunState,
  state: SupervisorSessionState = "OFFLINE",
): SupervisorSession {
  return {
    taskState: RunStateSchema.parse(taskState),
    state: SupervisorSessionStateSchema.parse(state),
  };
}

export function transitionSupervisorSession(
  session: SupervisorSession,
  input: SupervisorConnectivityEvent,
): SupervisorSession {
  const event = SupervisorConnectivityEventSchema.parse(input);
  const state: SupervisorSessionState = {
    CONNECT_REQUESTED: "CONNECTING",
    CHROME_CLOSED: "OFFLINE",
    LOGIN_EXPIRED: "AUTH_REQUIRED",
    DOM_INCOMPATIBLE: "INCOMPATIBLE",
    NATIVE_HOST_CRASHED: "CONNECTING",
    RUNTIME_RESTARTED: "RECONCILING",
    RECONCILED: "STANDBY",
    LEASE_STANDBY: "STANDBY",
    LEASE_ACTIVE: "ACTIVE",
    TRANSPORT_DEGRADED: "DEGRADED",
  }[event.type] as SupervisorSessionState;
  return { taskState: session.taskState, state };
}
