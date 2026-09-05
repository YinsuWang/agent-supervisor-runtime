import { loadConfig } from "../../config/loader.js";
import { buildRuntime } from "../../adapters/registry.js";

export async function resumeCommand(taskId: string, configPath = "orchestrator.config.json") {
  const config = await loadConfig(configPath);
  const runtime = await buildRuntime(config, configPath);
  try {
    const record = await runtime.orchestrator.resume(taskId);
    console.log(JSON.stringify(record, null, 2));
    return record;
  } finally {
    await runtime.close();
  }
}
