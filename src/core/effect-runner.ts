import type { CanonicalStore } from "./storage";
import { transitionEffect, type EffectOperation } from "./effect";

export type EffectExecutionResult =
  | { outcome: "SUCCEEDED"; evidence?: string[]; remoteIdentity?: string }
  | { outcome: "FAILED_RETRYABLE"; evidence?: string[] }
  | { outcome: "FAILED_TERMINAL"; evidence?: string[] }
  | { outcome: "OUTCOME_UNKNOWN"; evidence?: string[] };

export interface EffectExecutor {
  execute(operation: EffectOperation): Promise<EffectExecutionResult>;
  reconcile?(operation: EffectOperation): Promise<EffectExecutionResult>;
}

export interface EffectExecutionGuard {
  authorize(operation: EffectOperation): Promise<void>;
}

const runnableStatuses = new Set<EffectOperation["status"]>(["PENDING", "FAILED_RETRYABLE", "RECONCILE"]);

export class EffectRunner {
  public constructor(private readonly store: CanonicalStore, private readonly executor: EffectExecutor, private readonly guard?: EffectExecutionGuard) {}

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
        recovered.push(await this.reconcileOnce(candidate));
        continue;
      }
      if (candidate.expiresAt && Date.parse(candidate.expiresAt) <= Date.now() && (candidate.status === "PENDING" || candidate.status === "FAILED_RETRYABLE" || candidate.status === "RECONCILE")) {
        const expired = transitionEffect(candidate, "EXPIRED", { evidence: [...candidate.evidence, "runner-expired-before-execution"] });
        await this.store.updateEffect(expired);
        recovered.push(expired);
        continue;
      }
      if (candidate.nextAttemptAt && Date.parse(candidate.nextAttemptAt) > Date.now()) continue;
      if (!runnableStatuses.has(candidate.status)) continue;
      if (candidate.status === "RECONCILE") {
        recovered.push(await this.reconcileOnce(candidate));
        continue;
      }
      recovered.push(await this.executeOnce(candidate));
    }
    return recovered;
  }

  private async executeOnce(operation: EffectOperation): Promise<EffectOperation> {
    if (this.guard) {
      try {
        await this.guard.authorize(operation);
      } catch {
        const cancelled = transitionEffect(operation, "CANCELLED", { evidence: [...operation.evidence, "effect-guard-denied"] });
        await this.store.updateEffect(cancelled);
        return cancelled;
      }
    }
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

  private async reconcileOnce(operation: EffectOperation): Promise<EffectOperation> {
    if (!this.executor.reconcile) return operation;
    if (this.guard) {
      try {
        await this.guard.authorize(operation);
      } catch {
        const cancelled = transitionEffect(operation, "CANCELLED", { evidence: [...operation.evidence, "reconcile-guard-denied"] });
        await this.store.updateEffect(cancelled);
        return cancelled;
      }
    }
    let result: EffectExecutionResult;
    try {
      result = await this.executor.reconcile(operation);
    } catch {
      const waiting = { ...operation, evidence: [...operation.evidence, "reconcile-threw"] };
      await this.store.updateEffect(waiting);
      return waiting;
    }
    if (result.outcome === "OUTCOME_UNKNOWN") {
      const waiting = { ...operation, evidence: [...operation.evidence, ...(result.evidence ?? []), "reconciliation-remains-ambiguous"] };
      await this.store.updateEffect(waiting);
      return waiting;
    }
    const next = transitionEffect(operation, result.outcome, { evidence: [...operation.evidence, ...(result.evidence ?? [])], ...(result.outcome === "SUCCEEDED" && result.remoteIdentity ? { remoteIdentity: result.remoteIdentity } : {}) });
    await this.store.updateEffect(next);
    return next;
  }
}
