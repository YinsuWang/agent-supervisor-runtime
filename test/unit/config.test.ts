import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, RuntimeConfigSchema } from "../../src/config/schema.js";

describe("runtime config", () => {
  it("contains approved defaults", () => {
    expect(DEFAULT_CONFIG.policy.maxRevisions).toBe(3);
    expect(DEFAULT_CONFIG.policy.maxWorkerRetries).toBe(2);
    expect(DEFAULT_CONFIG.worker.adapter).toBe("codex-exec");
  });

  it("rejects unknown adapters and versions", () => {
    expect(() => RuntimeConfigSchema.parse({ ...DEFAULT_CONFIG, version: 2 })).toThrow();
    expect(() => RuntimeConfigSchema.parse({ ...DEFAULT_CONFIG, worker: { ...DEFAULT_CONFIG.worker, adapter: "other" } })).toThrow();
  });
});
