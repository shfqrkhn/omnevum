import type { CanonicalStore } from "./storage";
import { transitionEffect, type EffectOperation } from "./effect";

export type EffectExecutionResult =
  | { outcome: "SUCCEEDED"; evidence?: string[]; remoteIdentity?: string }
  | { outcome: "FAILED_RETRYABLE"; evidence?: string[] }
  | { outcome: "FAILED_TERMINAL"; evidence?: string[] }
  | { outcome: "OUTCOME_UNKNOWN"; evidence?: string[] };

export interface EffectExecutor {
  execute(operation: EffectOperation): Promise<EffectExecutionResult>;
}

const runnableStatuses = new Set<EffectOperation["status"]>(["PENDING", "FAILED_RETRYABLE", "RECONCILE"]);

export class EffectRunner {
  public constructor(private readonly store: CanonicalStore, private readonly executor: EffectExecutor) {}

  public async runAvailable(): Promise<EffectOperation[]> {
    const operations = await this.store.listEffects();
    const recovered: EffectOperation[] = [];
    for (const operation of operations) {
      let candidate = operation;
      if (candidate.status === "IN_FLIGHT") {
        candidate = transitionEffect(candidate, "OUTCOME_UNKNOWN", { evidence: [...candidate.evidence, "runner-recovered-in-flight"] });
        await this.store.updateEffect(candidate);
        candidate = transitionEffect(candidate, "RECONCILE");
        await this.store.updateEffect(candidate);
      }
      if (!runnableStatuses.has(candidate.status)) continue;
      recovered.push(await this.executeOnce(candidate));
    }
    return recovered;
  }

  private async executeOnce(operation: EffectOperation): Promise<EffectOperation> {
    const inFlight = transitionEffect(operation, "IN_FLIGHT");
    await this.store.updateEffect(inFlight);
    let result: EffectExecutionResult;
    try {
      result = await this.executor.execute(inFlight);
    } catch {
      result = { outcome: "FAILED_RETRYABLE", evidence: ["executor-threw"] };
    }
    const evidence = [...inFlight.evidence, ...(result.evidence ?? [])];
    const patch = { evidence, ...(result.outcome === "SUCCEEDED" && result.remoteIdentity ? { remoteIdentity: result.remoteIdentity } : {}), ...(result.outcome === "FAILED_RETRYABLE" ? { retryCount: inFlight.retryCount + 1 } : {}) };
    const final = transitionEffect(inFlight, result.outcome, patch);
    await this.store.updateEffect(final);
    return final;
  }
}
