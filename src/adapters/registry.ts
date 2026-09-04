import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { RuntimeConfig } from "../config/schema.js";
import { PolicyEngine } from "../core/policy-engine.js";
import { Orchestrator } from "../core/orchestrator.js";
import { FileStateStore } from "../stores/file/store.js";
import { MockSupervisorAdapter } from "../supervisors/mock/adapter.js";
import { ChatGPTSupervisorAdapter, type ChatGPTSupervisorAdapterOptions } from "../chatgpt/supervisor-adapter.js";
import { CodexExecWorker } from "../workers/codex-exec/adapter.js";
import type { WorkerAdapter } from "../contracts/worker.js";
import type { ConversationBinding } from "../conversations/binding.js";
import type { ConversationTransport } from "../conversations/transport.js";
import { MessageLedger } from "../conversations/message-ledger.js";
import type { ContextBroker } from "../context/broker.js";

export type ConversationRuntimeOptions = {
  worker: WorkerAdapter;
  binding: ConversationBinding;
  transport: ConversationTransport;
  stateDirectory: string;
  leaseEpoch: () => number;
  contextBroker?: ContextBroker;
  policy?: PolicyEngine;
  messageId?: () => string;
  nextSequence?: () => number;
  now?: () => Date;
  runId?: () => string;
};

export function createChatGPTSupervisor(options: ChatGPTSupervisorAdapterOptions): ChatGPTSupervisorAdapter {
  return new ChatGPTSupervisorAdapter(options);
}

export function buildConversationRuntime(options: ConversationRuntimeOptions) {
  const store = new FileStateStore(options.stateDirectory);
  const ledger = new MessageLedger(store, options.now);
  const supervisor = createChatGPTSupervisor({
    binding: options.binding,
    transport: options.transport,
    ledger,
    leaseEpoch: options.leaseEpoch,
    contextBroker: options.contextBroker,
    messageId: options.messageId,
    nextSequence: options.nextSequence,
  });
  const policy = options.policy ?? new PolicyEngine();
  const orchestrator = new Orchestrator({
    worker: options.worker,
    supervisor,
    store,
    policy,
    now: options.now,
    runId: options.runId,
  });
  return { orchestrator, store, ledger, worker: options.worker, supervisor, policy };
}

export async function buildRuntime(config: RuntimeConfig, configPath = "orchestrator.config.json") {
  const base = dirname(resolve(configPath));
  const stateDirectory = resolve(base, config.state.directory);
  const store = new FileStateStore(stateDirectory);

  let script: unknown[] = [];
  if (config.supervisor.scriptFile) {
    const parsed = JSON.parse(await readFile(resolve(base, config.supervisor.scriptFile), "utf8")) as unknown;
    if (!Array.isArray(parsed)) throw new Error("Mock supervisor script must be a JSON array");
    script = parsed;
  }

  const supervisor = new MockSupervisorAdapter(script);
  const worker = new CodexExecWorker({
    command: config.worker.command,
    argsPrefix: config.worker.argsPrefix,
    defaultTimeoutSeconds: config.worker.defaultTimeoutMinutes * 60,
    verificationCommands: config.worker.verificationCommands
  });
  const policy = new PolicyEngine(config.policy);
  const orchestrator = new Orchestrator({ worker, supervisor, store, policy });
  return { orchestrator, store, worker, supervisor, policy };
}
