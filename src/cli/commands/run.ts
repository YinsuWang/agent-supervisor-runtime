import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadConfig } from "../../config/loader.js";
import { buildRuntime } from "../../adapters/registry.js";

export async function runCommand(taskPath: string, configPath = "orchestrator.config.json") {
  const config = await loadConfig(configPath);
  const runtime = await buildRuntime(config, configPath);
  try {
    const task = JSON.parse(await readFile(resolve(taskPath), "utf8")) as unknown;
    const record = await runtime.orchestrator.run(task);
    console.log(JSON.stringify(record, null, 2));
    return record;
  } finally {
    await runtime.close();
  }
}
