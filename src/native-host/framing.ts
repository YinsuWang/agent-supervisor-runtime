export const MAX_NATIVE_HOST_OUTPUT_BYTES = 1024 * 1024;
export const MAX_NATIVE_HOST_INPUT_BYTES = 64 * 1024 * 1024;

export function encodeNativeMessage(value: unknown, maxBytes = MAX_NATIVE_HOST_OUTPUT_BYTES): Buffer {
  const payload = Buffer.from(JSON.stringify(value), "utf8");
  if (payload.length > maxBytes) throw new Error(`NATIVE_MESSAGE_TOO_LARGE:${payload.length}`);
  const header = Buffer.allocUnsafe(4);
  // Chrome Native Messaging uses the host machine's native byte order. V0.2's
  // first-class Windows targets are little-endian, so use UInt32LE explicitly.
  header.writeUInt32LE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

export class NativeMessageDecoder {
  private buffer = Buffer.alloc(0);

  constructor(private readonly maxBytes = MAX_NATIVE_HOST_INPUT_BYTES) {}

  push(chunk: Buffer): unknown[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages: unknown[] = [];
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32LE(0);
      if (length > this.maxBytes) throw new Error(`NATIVE_MESSAGE_TOO_LARGE:${length}`);
      if (this.buffer.length < 4 + length) break;
      const payload = this.buffer.subarray(4, 4 + length).toString("utf8");
      this.buffer = this.buffer.subarray(4 + length);
      try {
        messages.push(JSON.parse(payload));
      } catch {
        throw new Error("NATIVE_MESSAGE_MALFORMED_JSON");
      }
    }
    return messages;
  }
}
