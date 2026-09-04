import { createHash } from "node:crypto";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeFrame } from "./contracts.js";
import {
  RuntimeFrameDecoder,
  encodeLengthPrefixedJson,
  type RuntimeIpcClient,
  type RuntimeIpcConnection,
  type RuntimeIpcServer,
} from "./ipc.js";

export function runtimeEndpointForHome(runtimeHome: string, platform: NodeJS.Platform = process.platform): string {
  const hash = createHash("sha256").update(runtimeHome).digest("hex").slice(0, 16);
  if (platform === "win32") return `\\\\.\\pipe\\agent-supervisor-runtime-${hash}`;
  return join(tmpdir(), `agent-supervisor-runtime-${hash}.sock`);
}

class SocketConnection implements RuntimeIpcConnection {
  constructor(private readonly socket: net.Socket) {}

  async send(frame: RuntimeFrame): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.socket.write(encodeLengthPrefixedJson(frame), (error) => error ? reject(error) : resolve());
    });
  }

  async close(): Promise<void> {
    if (this.socket.destroyed) return;
    await new Promise<void>((resolve) => {
      this.socket.once("close", () => resolve());
      this.socket.end();
    });
  }
}

export class NamedPipeIpcServer implements RuntimeIpcServer {
  private server?: net.Server;

  constructor(readonly endpoint: string) {}

  async listen(handler: (frame: RuntimeFrame, connection: RuntimeIpcConnection) => Promise<void> | void): Promise<void> {
    if (this.server) throw new Error("IPC_SERVER_ALREADY_LISTENING");
    this.server = net.createServer((socket) => {
      const decoder = new RuntimeFrameDecoder();
      const connection = new SocketConnection(socket);
      socket.on("data", (chunk) => {
        try {
          for (const frame of decoder.push(Buffer.from(chunk))) {
            void Promise.resolve(handler(frame, connection)).catch(() => socket.destroy());
          }
        } catch {
          socket.destroy();
        }
      });
    });
    await new Promise<void>((resolve, reject) => {
      const server = this.server!;
      server.once("error", reject);
      server.listen(this.endpoint, () => {
        server.off("error", reject);
        resolve();
      });
    });
  }

  async close(): Promise<void> {
    if (!this.server) return;
    const server = this.server;
    this.server = undefined;
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => reject(error);
      server.once("error", onError);
      server.close(() => {
        server.off("error", onError);
        resolve();
      });
    });
  }
}

export class NamedPipeIpcClient implements RuntimeIpcClient {
  constructor(readonly endpoint: string) {}

  async connect(onFrame: (frame: RuntimeFrame) => Promise<void> | void): Promise<RuntimeIpcConnection> {
    const socket = await new Promise<net.Socket>((resolve, reject) => {
      const candidate = net.createConnection(this.endpoint);
      candidate.once("connect", () => resolve(candidate));
      candidate.once("error", reject);
    });
    const decoder = new RuntimeFrameDecoder();
    socket.on("data", (chunk) => {
      try {
        for (const frame of decoder.push(Buffer.from(chunk))) void Promise.resolve(onFrame(frame));
      } catch {
        socket.destroy();
      }
    });
    return new SocketConnection(socket);
  }
}
