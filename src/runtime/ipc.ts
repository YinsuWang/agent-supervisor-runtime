import type { RuntimeFrame } from "./contracts.js";
import { parseRuntimeFrame } from "./contracts.js";

export const DEFAULT_MAX_IPC_FRAME_BYTES = 1024 * 1024;

export interface RuntimeIpcConnection {
  send(frame: RuntimeFrame): Promise<void>;
  close(): Promise<void>;
}

export interface RuntimeIpcServer {
  listen(handler: (frame: RuntimeFrame, connection: RuntimeIpcConnection) => Promise<void> | void): Promise<void>;
  close(): Promise<void>;
}

export interface RuntimeIpcClient {
  connect(onFrame: (frame: RuntimeFrame) => Promise<void> | void): Promise<RuntimeIpcConnection>;
}

export function encodeLengthPrefixedJson(value: unknown, maxBytes = DEFAULT_MAX_IPC_FRAME_BYTES): Buffer {
  const payload = Buffer.from(JSON.stringify(value), "utf8");
  if (payload.length > maxBytes) throw new Error(`IPC_FRAME_TOO_LARGE:${payload.length}`);
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32LE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

export class LengthPrefixedJsonDecoder {
  private buffer = Buffer.alloc(0);

  constructor(private readonly maxBytes = DEFAULT_MAX_IPC_FRAME_BYTES) {}

  push(chunk: Buffer): unknown[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const values: unknown[] = [];
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32LE(0);
      if (length > this.maxBytes) throw new Error(`IPC_FRAME_TOO_LARGE:${length}`);
      if (this.buffer.length < 4 + length) break;
      const payload = this.buffer.subarray(4, 4 + length).toString("utf8");
      this.buffer = this.buffer.subarray(4 + length);
      try {
        values.push(JSON.parse(payload));
      } catch {
        throw new Error("IPC_FRAME_MALFORMED_JSON");
      }
    }
    return values;
  }
}

export class RuntimeFrameDecoder {
  private readonly decoder: LengthPrefixedJsonDecoder;
  constructor(maxBytes = DEFAULT_MAX_IPC_FRAME_BYTES) { this.decoder = new LengthPrefixedJsonDecoder(maxBytes); }
  push(chunk: Buffer): RuntimeFrame[] { return this.decoder.push(chunk).map((value) => parseRuntimeFrame(value)); }
}
