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

  it("accepts an explicit ChatGPT background-web binding", () => {
    const config = RuntimeConfigSchema.parse({
      ...DEFAULT_CONFIG,
      supervisor: {
        adapter: "chatgpt",
        binding: {
          bindingId: "bind_demo",
          workspaceId: "workspace_demo",
          conversationId: "conversation_demo",
          conversationUrl: "https://chatgpt.com/c/conversation_demo",
          preferredTransport: "background-web",
          createdAt: "2026-09-05T00:00:00.000Z",
        },
      },
    });

    expect(config.supervisor).toMatchObject({ adapter: "chatgpt", transport: "background-web" });
  });

  it("rejects a binding whose URL does not identify the configured conversation", () => {
    expect(() => RuntimeConfigSchema.parse({
      ...DEFAULT_CONFIG,
      supervisor: {
        adapter: "chatgpt",
        binding: {
          bindingId: "bind_demo",
          workspaceId: "workspace_demo",
          conversationId: "conversation_demo",
          conversationUrl: "https://chatgpt.com/c/another-conversation",
          preferredTransport: "background-web",
          createdAt: "2026-09-05T00:00:00.000Z",
        },
      },
    })).toThrow();
  });
});
