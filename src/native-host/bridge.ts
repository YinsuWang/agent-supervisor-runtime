import type { Readable, Writable } from "node:stream";
import { parseRuntimeFrame } from "../runtime/contracts.js";
import type { RuntimeIpcClient, RuntimeIpcConnection } from "../runtime/ipc.js";
import { NativeMessageDecoder, encodeNativeMessage } from "./framing.js";

export type NativeHostBridgeOptions = {
  input: Readable;
  output: Writable;
  runtimeClient: RuntimeIpcClient;
  startRuntime?: () => Promise<void>;
  connectAttempts?: number;
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

export class NativeHostBridge {
  private connection?: RuntimeIpcConnection;
  private readonly decoder = new NativeMessageDecoder();
  private processing = Promise.resolve();

  constructor(private readonly options: NativeHostBridgeOptions) {}

  async start(): Promise<void> {
    this.connection = await connectWithAutoStart(this.options);
    this.options.input.on("data", (chunk) => {
      this.processing = this.processing.then(async () => {
        for (const raw of this.decoder.push(Buffer.from(chunk))) {
          const frame = parseRuntimeFrame(raw);
          await this.connection!.send(frame);
        }
      }).catch((error) => {
        this.options.input.destroy(error as Error);
      });
    });
  }

  async stop(): Promise<void> {
    await this.processing;
    await this.connection?.close();
    this.connection = undefined;
  }
}

async function connectWithAutoStart(options: NativeHostBridgeOptions): Promise<RuntimeIpcConnection> {
  const attempts = options.connectAttempts ?? 20;
  const delayMs = options.retryDelayMs ?? 100;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let started = false;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await options.runtimeClient.connect(async (frame) => {
        await writeOutput(options.output, encodeNativeMessage(frame));
      });
    } catch (error) {
      lastError = error;
      if (!started && options.startRuntime) {
        started = true;
        await options.startRuntime();
      }
      if (attempt + 1 < attempts) await sleep(delayMs);
    }
  }
  throw new Error("RUNTIME_CONNECT_TIMEOUT", { cause: lastError });
}

async function writeOutput(output: Writable, buffer: Buffer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    output.write(buffer, (error) => error ? reject(error) : resolve());
  });
}
