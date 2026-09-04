import { describe, expect, it } from "vitest";
import {
  SupervisorSessionStateSchema,
  createSupervisorSession,
  transitionSupervisorSession,
} from "../../src/runtime/supervisor-session.js";
import { InMemoryTransportLeaseStore, TransportLeaseCoordinator } from "../../src/conversations/lease.js";
import { TransportManager } from "../../src/conversations/transport-manager.js";
import type { ConversationTransport } from "../../src/conversations/transport.js";

describe("supervisor connectivity session", () => {
  it("exposes exactly the approved connectivity states", () => {
    expect(SupervisorSessionStateSchema.options).toEqual([
      "OFFLINE",
      "CONNECTING",
      "AUTH_REQUIRED",
      "RECONCILING",
      "STANDBY",
      "ACTIVE",
      "DEGRADED",
      "INCOMPATIBLE",
    ]);
  });

  it.each([
    ["CHROME_CLOSED", "OFFLINE"],
    ["LOGIN_EXPIRED", "AUTH_REQUIRED"],
    ["DOM_INCOMPATIBLE", "INCOMPATIBLE"],
    ["NATIVE_HOST_CRASHED", "CONNECTING"],
    ["RUNTIME_RESTARTED", "RECONCILING"],
  ] as const)("maps %s without changing task state", (event, expected) => {
    const current = createSupervisorSession("RUNNING", "ACTIVE");
    const next = transitionSupervisorSession(current, { type: event });

    expect(next.state).toBe(expected);
    expect(next.taskState).toBe("RUNNING");
  });

  it("maps transport health details without leaking them into transport lease state", async () => {
    const manager = new TransportManager(new TransportLeaseCoordinator(new InMemoryTransportLeaseStore()));
    const transport: ConversationTransport = {
      id: "background",
      connect: async () => {},
      send: async () => {},
      waitForResponse: async () => ({ content: "" }),
      health: async () => ({ status: "OFFLINE", detail: "AUTH_REQUIRED" }),
      disconnect: async () => {},
    };
    manager.register(transport, 10);

    await expect(manager.inspectSupervisorState("background")).resolves.toBe("AUTH_REQUIRED");
    expect(manager.status("background")).toBe("STANDBY");
  });
});
