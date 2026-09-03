import { describe, expect, it } from "vitest";
import { parseSupervisorControlBlock } from "../../src/supervisors/protocol.js";

describe("supervisor control protocol", () => {
  it("parses prose plus a control block", () => {
    const result = parseSupervisorControlBlock(`Review complete.\n<orchestrator>{"version":1,"action":"REVIEW","decision":"PASS"}</orchestrator>`);
    expect(result).toMatchObject({ action: "REVIEW", decision: "PASS" });
  });

  it("rejects missing or malformed control blocks", () => {
    expect(() => parseSupervisorControlBlock("plain prose")).toThrow(/Missing/);
    expect(() => parseSupervisorControlBlock("<orchestrator>{bad}</orchestrator>")).toThrow(/valid JSON/);
  });
});
