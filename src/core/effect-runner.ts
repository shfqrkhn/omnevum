import { EffectStateConflictError, type CanonicalStore } from "./storage";
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
        if (!await this.updateIfCurrent(candidate, "IN_FLIGHT")) continue;
        candidate = transitionEffect(candidate, "RECONCILE");
        if (!await this.updateIfCurrent(candidate, "OUTCOME_UNKNOWN")) continue;
        recovered.push(await this.reconcileOnce(candidate));
        continue;
      }
      if (candidate.expiresAt && Date.parse(candidate.expiresAt) <= Date.now() && (candidate.status === "PENDING" || candidate.status === "FAILED_RETRYABLE" || candidate.status === "RECONCILE")) {
        const expired = transitionEffect(candidate, "EXPIRED", { evidence: [...candidate.evidence, "runner-expired-before-execution"] });
        if (await this.updateIfCurrent(expired, candidate.status)) recovered.push(expired);
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
        if (await this.updateIfCurrent(cancelled, operation.status)) return cancelled;
        return (await this.store.getEffect(operation.operationId)) ?? operation;
      }
    }
    const inFlight = transitionEffect(operation, "IN_FLIGHT");
    if (!await this.updateIfCurrent(inFlight, operation.status)) return (await this.store.getEffect(operation.operationId)) ?? operation;
    let result: EffectExecutionResult;
    try {
      result = await this.executor.execute(inFlight);
    } catch {
      result = { outcome: "FAILED_RETRYABLE", evidence: ["executor-threw"] };
    }
    const evidence = [...inFlight.evidence, ...(result.evidence ?? [])];
    const patch = { evidence, ...(result.outcome === "SUCCEEDED" && result.remoteIdentity ? { remoteIdentity: result.remoteIdentity } : {}), ...(result.outcome === "FAILED_RETRYABLE" ? { retryCount: inFlight.retryCount + 1 } : {}) };
    const final = transitionEffect(inFlight, result.outcome, patch);
    if (!await this.updateIfCurrent(final, "IN_FLIGHT")) return (await this.store.getEffect(operation.operationId)) ?? inFlight;
    return final;
  }

  private async reconcileOnce(operation: EffectOperation): Promise<EffectOperation> {
    if (!this.executor.reconcile) return operation;
    if (this.guard) {
      try {
        await this.guard.authorize(operation);
      } catch {
        const cancelled = transitionEffect(operation, "CANCELLED", { evidence: [...operation.evidence, "reconcile-guard-denied"] });
        if (await this.updateIfCurrent(cancelled, operation.status)) return cancelled;
        return (await this.store.getEffect(operation.operationId)) ?? operation;
      }
    }
    const inFlight = transitionEffect(operation, "IN_FLIGHT", { evidence: [...operation.evidence, "reconciliation-started"] });
    if (!await this.updateIfCurrent(inFlight, operation.status)) return (await this.store.getEffect(operation.operationId)) ?? operation;
    let result: EffectExecutionResult;
    try {
      result = await this.executor.reconcile(inFlight);
    } catch {
      const waiting = transitionEffect(inFlight, "OUTCOME_UNKNOWN", { evidence: [...inFlight.evidence, "reconcile-threw"] });
      if (!await this.updateIfCurrent(waiting, "IN_FLIGHT")) return (await this.store.getEffect(operation.operationId)) ?? inFlight;
      const reconcile = transitionEffect(waiting, "RECONCILE");
      if (!await this.updateIfCurrent(reconcile, "OUTCOME_UNKNOWN")) return (await this.store.getEffect(operation.operationId)) ?? waiting;
      return reconcile;
    }
    if (result.outcome === "OUTCOME_UNKNOWN") {
      const waiting = transitionEffect(inFlight, "OUTCOME_UNKNOWN", { evidence: [...inFlight.evidence, ...(result.evidence ?? []), "reconciliation-remains-ambiguous"] });
      if (!await this.updateIfCurrent(waiting, "IN_FLIGHT")) return (await this.store.getEffect(operation.operationId)) ?? inFlight;
      const reconcile = transitionEffect(waiting, "RECONCILE");
      if (!await this.updateIfCurrent(reconcile, "OUTCOME_UNKNOWN")) return (await this.store.getEffect(operation.operationId)) ?? waiting;
      return reconcile;
    }
    const next = transitionEffect(inFlight, result.outcome, { evidence: [...inFlight.evidence, ...(result.evidence ?? [])], ...(result.outcome === "SUCCEEDED" && result.remoteIdentity ? { remoteIdentity: result.remoteIdentity } : {}) });
    if (!await this.updateIfCurrent(next, "IN_FLIGHT")) return (await this.store.getEffect(operation.operationId)) ?? inFlight;
    return next;
  }

  private async updateIfCurrent(operation: EffectOperation, expectedStatus: EffectOperation["status"]): Promise<boolean> {
    try {
      await this.store.updateEffect(operation, expectedStatus);
      return true;
    } catch (error) {
      if (error instanceof EffectStateConflictError) return false;
      throw error;
    }
  }
}
