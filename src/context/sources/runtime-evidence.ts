import type { ContextScope } from "../contracts.js";

export interface RuntimeEvidenceProvider {
  executionSummary(scope: ContextScope): Promise<string | undefined>;
  testSummary(scope: ContextScope): Promise<string | undefined>;
}

export class RuntimeEvidenceSource {
  constructor(private readonly provider?: RuntimeEvidenceProvider) {}

  async executionSummary(scope: ContextScope): Promise<string | undefined> {
    return this.provider?.executionSummary(scope);
  }

  async testSummary(scope: ContextScope): Promise<string | undefined> {
    return this.provider?.testSummary(scope);
  }
}
