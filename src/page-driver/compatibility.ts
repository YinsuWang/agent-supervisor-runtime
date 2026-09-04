import type { PageCapabilityReport, PageCompatibility } from "./contracts.js";

const capabilityNames: Array<keyof PageCapabilityReport> = [
  "conversationIdentity",
  "composer",
  "submit",
  "assistantMessages",
  "generationLifecycle",
];

export function evaluatePageCompatibility(report: PageCapabilityReport): PageCompatibility {
  const missing = capabilityNames.filter((capability) => !report[capability]);
  return {
    ...report,
    status: missing.length === 0 ? "COMPATIBLE" : "INCOMPATIBLE",
    missing,
  };
}
