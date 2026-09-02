import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { RuntimeConfigSchema, type RuntimeConfig } from "./schema.js";

export async function loadConfig(path = "orchestrator.config.json"): Promise<RuntimeConfig> {
  const absolute = resolve(path);
  const raw = JSON.parse(await readFile(absolute, "utf8")) as unknown;
  return RuntimeConfigSchema.parse(raw);
}
