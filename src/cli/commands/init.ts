import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DEFAULT_CONFIG } from "../../config/schema.js";

export async function initCommand(directory = process.cwd()): Promise<void> {
  const configPath = resolve(directory, "orchestrator.config.json");
  try {
    await writeFile(configPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  await mkdir(resolve(directory, DEFAULT_CONFIG.state.directory), { recursive: true });
  console.log(`Initialized agent-supervisor-runtime in ${directory}`);
}
