import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { companionProfileDirectory } from "../companion/profile.js";
import type { PageCompatibility } from "../page-driver/contracts.js";
import { RuntimeProtocolVersion, type RuntimeFrame } from "../runtime/contracts.js";
import { NamedPipeIpcClient, runtimeEndpointForHome } from "../runtime/named-pipe.js";
import type { SupervisorSessionState } from "../runtime/supervisor-session.js";
import { NativeHostManifestSchema } from "./native-host-manifest.js";
import { WindowsRegistry } from "./windows-registry.js";
import { ASR_VERSION } from "../version.js";

const ExtensionSessionObservationSchema = z.object({
  protocol: z.literal(RuntimeProtocolVersion),
  extensionInstanceId: z.string().min(1),
  extensionVersion: z.string().min(1),
  capabilities: z.array(z.string().min(1)),
  runtimeInstanceId: z.string().min(1),
  sessionId: z.string().min(1),
  observedAt: z.string().datetime(),
});

export type DoctorProbeOutput = {
  ok: boolean;
  detail: string;
  data?: unknown;
};

export type SupervisorDoctorCheck = DoctorProbeOutput & {
  name: "runtime-ipc" | "native-host-registration" | "extension-protocol" | "companion-profile" | "page-driver-capabilities";
  state: SupervisorSessionState;
};

export type SupervisorDoctorProbes = {
  runtimeIpc: () => Promise<DoctorProbeOutput>;
  nativeHostRegistration: () => Promise<DoctorProbeOutput>;
  extensionProtocol: () => Promise<DoctorProbeOutput>;
  companionProfile: () => Promise<DoctorProbeOutput>;
  pageDriver: () => Promise<DoctorProbeOutput>;
};

export type SupervisorDoctorOptions = {
  runtimeHome?: string;
  probes?: SupervisorDoctorProbes;
  pageCompatibilityProbe?: () => Promise<PageCompatibility>;
};

const probeOrder: Array<[SupervisorDoctorCheck["name"], keyof SupervisorDoctorProbes]> = [
  ["runtime-ipc", "runtimeIpc"],
  ["native-host-registration", "nativeHostRegistration"],
  ["extension-protocol", "extensionProtocol"],
  ["companion-profile", "companionProfile"],
  ["page-driver-capabilities", "pageDriver"],
];

export async function runSupervisorDoctor(options: SupervisorDoctorOptions = {}): Promise<SupervisorDoctorCheck[]> {
  const probes = options.probes ?? defaultDoctorProbes(options);
  const checks: SupervisorDoctorCheck[] = [];
  for (const [name, key] of probeOrder) {
    try {
      const result = await probes[key]();
      checks.push({ name, ...result, state: stateForCheck(name, result) });
    } catch (error) {
      const result = { ok: false, detail: (error as Error).message };
      checks.push({ name, ...result, state: stateForCheck(name, result) });
    }
  }
  return checks;
}

function defaultDoctorProbes(options: SupervisorDoctorOptions): SupervisorDoctorProbes {
  const runtimeHome = options.runtimeHome ?? process.env.ASR_RUNTIME_HOME ?? "";
  if (!runtimeHome) throw new Error("runtimeHome is required for supervisor doctor probes");
  const manifestPath = join(runtimeHome, "native-host", "com.agent_supervisor_runtime.json");
  const extensionSessionPath = join(runtimeHome, "health", "extension-session.json");
  return {
    runtimeIpc: () => probeRuntimeIpc(runtimeHome),
    nativeHostRegistration: async () => {
      const manifest = NativeHostManifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
      await access(manifest.path, constants.F_OK);
      if (process.platform === "win32") {
        const registeredPath = await new WindowsRegistry().nativeHostManifestPath(manifest.name);
        if (!registeredPath) throw new Error(`native host is not registered under HKCU: ${manifest.name}`);
        if (resolve(registeredPath).toLowerCase() !== resolve(manifestPath).toLowerCase()) {
          throw new Error(`native host registry path mismatch: ${registeredPath}`);
        }
      }
      return { ok: true, detail: manifestPath, data: { allowedOrigins: manifest.allowed_origins } };
    },
    extensionProtocol: async () => {
      let raw: unknown;
      try {
        raw = JSON.parse(await readFile(extensionSessionPath, "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return { ok: false, detail: "extension handshake has not been observed" };
        }
        throw error;
      }
      const parsed = ExtensionSessionObservationSchema.safeParse(raw);
      if (!parsed.success) return { ok: false, detail: `PROTOCOL_INCOMPATIBLE: ${parsed.error.message}` };
      const observation = parsed.data;
      return {
        ok: true,
        detail: `${observation.protocol} observed from extension ${observation.extensionVersion}`,
        data: { capabilities: observation.capabilities, observedAt: observation.observedAt },
      };
    },
    companionProfile: async () => {
      const profile = companionProfileDirectory({ runtimeHome });
      await access(profile, constants.R_OK | constants.W_OK);
      return { ok: true, detail: profile };
    },
    pageDriver: async () => {
      if (!options.pageCompatibilityProbe) {
        return { ok: false, detail: "live page capability probe unavailable" };
      }
      const compatibility = await options.pageCompatibilityProbe();
      return {
        ok: compatibility.status === "COMPATIBLE",
        detail: compatibility.status === "COMPATIBLE" ? "all semantic capabilities available" : `missing: ${compatibility.missing.join(", ")}`,
        data: compatibility,
      };
    },
  };
}

async function probeRuntimeIpc(runtimeHome: string): Promise<DoctorProbeOutput> {
  const client = new NamedPipeIpcClient(runtimeEndpointForHome(runtimeHome));
  let connection: Awaited<ReturnType<typeof client.connect>> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const response = new Promise<RuntimeFrame>((resolve, reject) => {
    timer = setTimeout(() => reject(new Error("runtime IPC handshake timed out")), 1_000);
    void client.connect((frame) => {
      if (frame.type !== "WELCOME") return;
      if (timer) clearTimeout(timer);
      resolve(frame);
    }).then(async (connected) => {
      connection = connected;
      await connected.send({
        protocol: RuntimeProtocolVersion,
        frameId: `doctor_${randomUUID()}`,
        type: "HELLO",
        timestamp: new Date().toISOString(),
        payload: { extensionInstanceId: "doctor", extensionVersion: ASR_VERSION, capabilities: ["doctor"] },
      });
    }, reject);
  });
  try {
    const welcome = await response;
    return { ok: true, detail: `${welcome.protocol} runtime reachable`, data: welcome.payload };
  } finally {
    if (timer) clearTimeout(timer);
    await connection?.close().catch(() => undefined);
  }
}

function stateForCheck(name: SupervisorDoctorCheck["name"], result: DoctorProbeOutput): SupervisorSessionState {
  if (result.ok) return name === "runtime-ipc" ? "ACTIVE" : "STANDBY";
  if (name === "page-driver-capabilities") {
    const status = (result.data as { status?: unknown } | undefined)?.status;
    if (status === "INCOMPATIBLE") return "INCOMPATIBLE";
    if (result.detail.includes("AUTH_REQUIRED")) return "AUTH_REQUIRED";
  }
  if (name === "extension-protocol") {
    return result.detail.includes("PROTOCOL_INCOMPATIBLE") ? "INCOMPATIBLE" : "DEGRADED";
  }
  return name === "runtime-ipc" ? "OFFLINE" : "DEGRADED";
}
