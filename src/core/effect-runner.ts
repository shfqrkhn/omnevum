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
  supports?(operation: EffectOperation): boolean;
}

export interface EffectExecutionGuard {
  authorize(operation: EffectOperation): Promise<void>;
}

const runnableStatuses = new Set<EffectOperation["status"]>(["PENDING", "FAILED_RETRYABLE", "RECONCILE"]);

export class EffectRunner {
  public constructor(private readonly store: CanonicalStore, private readonly executor?: EffectExecutor, private readonly guard?: EffectExecutionGuard) {}

  public async recoverInterrupted(): Promise<EffectOperation[]> {
    const recovered: EffectOperation[] = [];
    for (const operation of await this.store.listEffects("IN_FLIGHT")) {
      const next = await this.recoverInterruptedOperation(operation);
      if (next) recovered.push(next);
    }
    return recovered;
  }

  public async runAvailable(): Promise<EffectOperation[]> {
    const operations = await this.store.listEffects();
    const recovered: EffectOperation[] = [];
    for (const operation of operations) {
      let candidate = operation;
      if (candidate.status === "IN_FLIGHT") {
        const interrupted = await this.recoverInterruptedOperation(candidate);
        if (!interrupted) continue;
        if (!this.supports(interrupted)) {
          recovered.push(interrupted);
          continue;
        }
        recovered.push(await this.reconcileOnce(interrupted));
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
        if (!this.supports(candidate)) {
          recovered.push(candidate);
          continue;
        }
        if (!this.executor?.reconcile) {
          recovered.push(candidate);
          continue;
        }
        recovered.push(await this.reconcileOnce(candidate));
        continue;
      }
      if (!this.executor) continue;
      if (!this.supports(candidate)) continue;
      recovered.push(await this.executeOnce(candidate));
    }
    return recovered;
  }

  private async recoverInterruptedOperation(operation: EffectOperation): Promise<EffectOperation | undefined> {
    let candidate = transitionEffect(operation, "OUTCOME_UNKNOWN", { evidence: [...operation.evidence, "runner-recovered-in-flight"] });
    if (!await this.updateIfCurrent(candidate, "IN_FLIGHT")) return undefined;
    candidate = transitionEffect(candidate, "RECONCILE");
    if (!await this.updateIfCurrent(candidate, "OUTCOME_UNKNOWN")) return undefined;
    return candidate;
  }

  private async executeOnce(operation: EffectOperation): Promise<EffectOperation> {
    const executor = this.executor;
    if (!executor) return operation;
    if (this.guard) {
      try {
        await this.guard.authorize(operation);
      } catch {
        const cancelled = transitionEffect(operation, "CANCELLED", { evidence: [...operation.evidence, "effect-guard-denied"] });
        if (await this.updateIfCurrent(cancelled, operation.status)) return cancelled;
        return (await this.store.getEffect(operation.operationId)) ?? operation;
      }
    }
    const inFlight = transitionEffect(operation, "IN_FLIGHT", { nextAttemptAt: undefined });
    if (!await this.updateIfCurrent(inFlight, operation.status)) return (await this.store.getEffect(operation.operationId)) ?? operation;
    let result: EffectExecutionResult;
    try {
      result = await executor.execute(inFlight);
    } catch {
      result = { outcome: "FAILED_RETRYABLE", evidence: ["executor-threw"] };
    }
    const evidence = [...inFlight.evidence, ...(result.evidence ?? [])];
    const attemptCount = inFlight.retryCount + 1;
    const exhausted = result.outcome === "FAILED_RETRYABLE" && attemptCount >= inFlight.retryPolicy.maxAttempts;
    const nextStatus = exhausted ? "FAILED_TERMINAL" : result.outcome;
    const retryDelaySeconds = Math.min(inFlight.retryPolicy.backoffSeconds * (2 ** Math.max(0, attemptCount - 1)), 31_536_000);
    const patch = {
      evidence: exhausted ? [...evidence, "retry-limit-reached"] : evidence,
      nextAttemptAt: result.outcome === "FAILED_RETRYABLE" && !exhausted ? new Date(Date.now() + retryDelaySeconds * 1000).toISOString() : undefined,
      ...(result.outcome === "SUCCEEDED" && result.remoteIdentity ? { remoteIdentity: result.remoteIdentity } : {}),
      ...(result.outcome === "FAILED_RETRYABLE" ? { retryCount: attemptCount } : {})
    };
    if (result.outcome === "OUTCOME_UNKNOWN") {
      const unknown = transitionEffect(inFlight, "OUTCOME_UNKNOWN", { evidence: [...evidence, "execution-remains-ambiguous"] });
      if (!await this.updateIfCurrent(unknown, "IN_FLIGHT")) return (await this.store.getEffect(operation.operationId)) ?? inFlight;
      const reconcile = transitionEffect(unknown, "RECONCILE");
      if (!await this.updateIfCurrent(reconcile, "OUTCOME_UNKNOWN")) return (await this.store.getEffect(operation.operationId)) ?? unknown;
      return reconcile;
    }
    const final = transitionEffect(inFlight, nextStatus, patch);
    if (!await this.updateIfCurrent(final, "IN_FLIGHT")) return (await this.store.getEffect(operation.operationId)) ?? inFlight;
    return final;
  }

  private async reconcileOnce(operation: EffectOperation): Promise<EffectOperation> {
    const executor = this.executor;
    if (!executor?.reconcile) return operation;
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
      result = await executor.reconcile(inFlight);
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

  private supports(operation: EffectOperation): boolean {
    return this.executor?.supports ? this.executor.supports(operation) : true;
  }
}
