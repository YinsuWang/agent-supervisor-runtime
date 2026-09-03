import { loadConfig } from "../../config/loader.js";
import { buildRuntime } from "../../adapters/registry.js";

export async function statusCommand(taskId: string, configPath = "orchestrator.config.json") {
  const config = await loadConfig(configPath);
  const { store } = await buildRuntime(config, configPath);
  const record = await store.loadRecord(taskId);
  if (!record) throw new Error(`Task ${taskId} not found`);
  console.log(`Task: ${record.taskId}\nState: ${record.state}\nRevision: ${record.revisionCount}/${config.policy.maxRevisions}\nRetries: ${record.retryCount}/${config.policy.maxWorkerRetries}\nCurrent Run: ${record.currentRunId ?? "-"}`);
  return record;
}
