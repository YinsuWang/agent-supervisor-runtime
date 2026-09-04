import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import type { RuntimeFrame } from "./contracts.js";
import { RuntimeProtocolVersion, validateHello } from "./contracts.js";
import { NamedPipeIpcServer, runtimeEndpointForHome } from "./named-pipe.js";
import { acquireSingleInstanceLock, type SingleInstanceLock } from "./single-instance.js";
import { writeJsonAtomic } from "../utils/json.js";

export type RuntimeCommandHandler = (frame: RuntimeFrame) => Promise<unknown> | unknown;

export type RuntimeDaemonOptions = {
  runtimeHome: string;
  runtimeVersion: string;
  runtimeInstanceId?: string;
  commandHandler?: RuntimeCommandHandler;
  server?: NamedPipeIpcServer;
};

export function defaultRuntimeHome(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string {
  if (env.ASR_RUNTIME_HOME) return env.ASR_RUNTIME_HOME;
  if (platform === "win32" && env.LOCALAPPDATA) return join(env.LOCALAPPDATA, "AgentSupervisorRuntime");
  return join(homedir(), ".local", "share", "agent-supervisor-runtime");
}

export class RuntimeDaemon {
  readonly runtimeInstanceId: string;
  readonly endpoint: string;
  private readonly server: NamedPipeIpcServer;
  private lock?: SingleInstanceLock;

  constructor(private readonly options: RuntimeDaemonOptions) {
    this.runtimeInstanceId = options.runtimeInstanceId ?? `runtime_${randomUUID()}`;
    this.endpoint = runtimeEndpointForHome(options.runtimeHome);
    this.server = options.server ?? new NamedPipeIpcServer(this.endpoint);
  }

  async start(): Promise<void> {
    if (this.lock) throw new Error("RUNTIME_DAEMON_ALREADY_STARTED");
    this.lock = await acquireSingleInstanceLock(this.options.runtimeHome);
    try {
      await this.server.listen(async (frame, connection) => {
        if (frame.type === "HELLO") {
          const hello = validateHello(frame);
          const sessionId = `session_${randomUUID()}`;
          await writeJsonAtomic(join(this.options.runtimeHome, "health", "extension-session.json"), {
            protocol: frame.protocol,
            extensionInstanceId: hello.extensionInstanceId,
            extensionVersion: hello.extensionVersion,
            capabilities: hello.capabilities,
            runtimeInstanceId: this.runtimeInstanceId,
            sessionId,
            observedAt: new Date().toISOString(),
          });
          await connection.send({
            protocol: RuntimeProtocolVersion,
            frameId: `frame_${randomUUID()}`,
            type: "WELCOME",
            sessionId,
            timestamp: new Date().toISOString(),
            payload: {
              runtimeInstanceId: this.runtimeInstanceId,
              runtimeVersion: this.options.runtimeVersion,
              sessionId,
              status: "READY",
            },
          });
          return;
        }

        if (frame.type === "HEARTBEAT") {
          await connection.send({
            protocol: RuntimeProtocolVersion,
            frameId: `frame_${randomUUID()}`,
            type: "ACK",
            sessionId: frame.sessionId,
            timestamp: new Date().toISOString(),
            payload: { inReplyTo: frame.frameId },
          });
          return;
        }

        if (frame.type !== "COMMAND") {
          await connection.send(errorFrame(frame, "UNSUPPORTED_FRAME", `Runtime does not accept ${frame.type} as a command`));
          return;
        }

        try {
          const result = await this.options.commandHandler?.(frame);
          await connection.send({
            protocol: RuntimeProtocolVersion,
            frameId: `frame_${randomUUID()}`,
            type: "ACK",
            sessionId: frame.sessionId,
            timestamp: new Date().toISOString(),
            payload: { inReplyTo: frame.frameId, result },
          });
        } catch (error) {
          await connection.send(errorFrame(frame, "COMMAND_FAILED", (error as Error).message));
        }
      });
    } catch (error) {
      await this.lock.release();
      this.lock = undefined;
      throw error;
    }
  }

  async stop(): Promise<void> {
    await this.server.close();
    await this.lock?.release();
    this.lock = undefined;
  }
}

function errorFrame(frame: RuntimeFrame, code: string, message: string): RuntimeFrame {
  return {
    protocol: RuntimeProtocolVersion,
    frameId: `frame_${randomUUID()}`,
    type: "ERROR",
    sessionId: frame.sessionId,
    timestamp: new Date().toISOString(),
    payload: { inReplyTo: frame.frameId, code, message },
  };
}
