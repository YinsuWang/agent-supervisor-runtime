import { describe, expect, it } from "vitest";
import { runSupervisorDoctor } from "../../src/setup/doctor.js";

describe("V0.2 supervisor doctor", () => {
  it("reports every transport layer independently and surfaces missing page capabilities", async () => {
    const checks = await runSupervisorDoctor({
      probes: {
        runtimeIpc: async () => ({ ok: true, detail: "ASR-NM/1" }),
        nativeHostRegistration: async () => ({ ok: true, detail: "registered" }),
        extensionProtocol: async () => ({ ok: true, detail: "ASR-NM/1 compatible" }),
        companionProfile: async () => ({ ok: true, detail: "ready" }),
        pageDriver: async () => ({
          ok: false,
          detail: "missing: composer, submit",
          data: { status: "INCOMPATIBLE", missing: ["composer", "submit"] },
        }),
      },
    });

    expect(checks.map((check) => check.name)).toEqual([
      "runtime-ipc",
      "native-host-registration",
      "extension-protocol",
      "companion-profile",
      "page-driver-capabilities",
    ]);
    expect(checks.at(-1)).toMatchObject({ ok: false, state: "INCOMPATIBLE" });
    expect(checks.at(-1)?.data).toEqual({ status: "INCOMPATIBLE", missing: ["composer", "submit"] });
  });

  it("does not misreport an unavailable live probe as expired authentication", async () => {
    const checks = await runSupervisorDoctor({
      probes: {
        runtimeIpc: async () => ({ ok: false, detail: "offline" }),
        nativeHostRegistration: async () => ({ ok: false, detail: "missing" }),
        extensionProtocol: async () => ({ ok: false, detail: "not observed" }),
        companionProfile: async () => ({ ok: true, detail: "ready" }),
        pageDriver: async () => ({ ok: false, detail: "live page capability probe unavailable" }),
      },
    });

    expect(checks.at(-1)?.state).toBe("DEGRADED");
  });
});
