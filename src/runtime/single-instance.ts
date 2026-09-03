import { mkdir, open, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

export type SingleInstanceLock = {
  readonly path: string;
  release(): Promise<void>;
};

export type SingleInstanceOptions = {
  pid?: number;
  now?: () => Date;
  isPidAlive?: (pid: number) => boolean;
};

type LockRecord = {
  pid: number;
  startedAt: string;
};

export async function acquireSingleInstanceLock(
  runtimeHome: string,
  options: SingleInstanceOptions = {},
): Promise<SingleInstanceLock> {
  await mkdir(runtimeHome, { recursive: true });
  const path = join(runtimeHome, "runtime.lock");
  const pid = options.pid ?? process.pid;
  const now = options.now ?? (() => new Date());
  const isPidAlive = options.isPidAlive ?? defaultIsPidAlive;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(path, "wx");
      const record: LockRecord = { pid, startedAt: now().toISOString() };
      try {
        await handle.writeFile(`${JSON.stringify(record)}\n`, "utf8");
      } finally {
        await handle.close();
      }
      let released = false;
      return {
        path,
        async release() {
          if (released) return;
          released = true;
          const current = await readLock(path);
          if (current?.pid === pid) await rm(path, { force: true });
        },
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const existing = await readLock(path);
      if (existing && isPidAlive(existing.pid)) {
        throw new Error(`RUNTIME_ALREADY_RUNNING:${existing.pid}`);
      }
      await rm(path, { force: true });
    }
  }
  throw new Error("RUNTIME_LOCK_ACQUIRE_FAILED");
}

async function readLock(path: string): Promise<LockRecord | undefined> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as Partial<LockRecord>;
    if (typeof parsed.pid !== "number" || !Number.isInteger(parsed.pid) || parsed.pid <= 0) return undefined;
    if (typeof parsed.startedAt !== "string") return undefined;
    return { pid: parsed.pid, startedAt: parsed.startedAt };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    return undefined;
  }
}

function defaultIsPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
