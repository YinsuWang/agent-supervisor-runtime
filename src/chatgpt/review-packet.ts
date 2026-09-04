import type { Task } from "../contracts/task.js";
import type { WorkerResult } from "../contracts/result.js";
import type { ContextManifest } from "../context/contracts.js";

export type CompactReviewPacket = {
  task: {
    taskId: string;
    objective: string;
    acceptanceCriteria: string[];
    revisionNumber: number;
  };
  worker: {
    runId: string;
    status: WorkerResult["status"];
    summary: string;
  };
  changedFiles: {
    count: number;
    paths: string[];
  };
  tests: {
    total: number;
    passed: number;
    failed: number;
    commands: string[];
  };
  evidence: ContextManifest["available"];
};

export function compileReviewPacket(
  task: Task,
  result: WorkerResult,
  manifest: ContextManifest,
  maxBytes = 6 * 1024,
): CompactReviewPacket {
  const packet: CompactReviewPacket = {
    task: {
      taskId: task.taskId,
      objective: task.objective,
      acceptanceCriteria: task.acceptanceCriteria,
      revisionNumber: task.revision?.revisionNumber ?? 0,
    },
    worker: {
      runId: result.runId,
      status: result.status,
      summary: result.summary,
    },
    changedFiles: {
      count: result.changedFiles.length,
      paths: result.changedFiles,
    },
    tests: {
      total: result.verification.length,
      passed: result.verification.filter((item) => item.passed).length,
      failed: result.verification.filter((item) => !item.passed).length,
      commands: result.verification.map((item) => item.command),
    },
    evidence: manifest.available.map((item) => ({ ...item })),
  };

  if (Buffer.byteLength(JSON.stringify(packet), "utf8") > maxBytes) {
    throw new Error("REVIEW_PACKET_TOO_LARGE");
  }
  return packet;
}
