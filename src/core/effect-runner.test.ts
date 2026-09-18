import { describe, expect, it } from "vitest";
import type { EffectOperation } from "./effect";
import { EffectRunner } from "./effect-runner";
import { CanonicalStore } from "./storage";
import { CredentialKeyBroker } from "./credential";

function effect(status: EffectOperation["status"] = "PENDING"): EffectOperation {
  return {
    operationId: "runner-effect",
    owner: "platform.test",
    originatingCommand: "test.command",
    purpose: "test",
    destination: "test://destination",
    payloadOrReference: { value: "safe" },
    idempotencyKey: "runner-effect-idempotency",
    createdAt: new Date().toISOString(),
    status,
    retryCount: 0,
    retryPolicy: { maxAttempts: 3, backoffSeconds: 1 },
    evidence: []
  };
}

describe("EffectRunner", () => {
  it("recovers interrupted operations on startup without an external adapter", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-startup-recovery`);
    await store.open();
    const interrupted = effect("IN_FLIGHT");
    await store.enqueueEffect(interrupted);

    const recovered = await new EffectRunner(store).recoverInterrupted();

    expect(recovered).toHaveLength(1);
    expect(recovered[0]?.status).toBe("RECONCILE");
    expect(recovered[0]?.evidence).toContain("runner-recovered-in-flight");
    await expect(store.getEffect(interrupted.operationId)).resolves.toMatchObject({ status: "RECONCILE" });
    store.close();
  });

  it("recovers an interrupted in-flight operation and completes only through reconciliation", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-effect-runner`);
    await store.open();
    await store.enqueueEffect(effect("IN_FLIGHT"));
    const seen: EffectOperation["status"][] = [];
    const runner = new EffectRunner(store, {
      execute: async () => {
        throw new Error("ambiguous operation must not be replayed");
      },
      reconcile: async (operation) => {
        seen.push(operation.status);
        return { outcome: "SUCCEEDED", evidence: ["reconciled-idempotently"], remoteIdentity: "remote-1" };
      }
    });
    const result = await runner.runAvailable();
    expect(seen).toEqual(["IN_FLIGHT"]);
    expect(result[0]).toMatchObject({ status: "SUCCEEDED", remoteIdentity: "remote-1" });
    expect(await store.getEffect("runner-effect")).toMatchObject({ status: "SUCCEEDED", idempotencyKey: "runner-effect-idempotency" });
    store.close();
  });

  it("persists retryable failure without duplicating the operation", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-effect-retry`);
    await store.open();
    await store.enqueueEffect(effect());
    const runner = new EffectRunner(store, { execute: async () => ({ outcome: "FAILED_RETRYABLE", evidence: ["offline"] }) });
    const result = await runner.runAvailable();
    expect(result[0]).toMatchObject({ status: "FAILED_RETRYABLE", retryCount: 1 });
    expect(Date.parse(result[0]?.nextAttemptAt ?? "")).toBeGreaterThan(Date.now());
    expect((await store.listEffects())[0]?.retryCount).toBe(1);
    store.close();
  });

  it("moves an ambiguous execution into reconciliation without replaying it", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-effect-ambiguous`);
    await store.open();
    await store.enqueueEffect(effect());
    let executions = 0;
    let reconciliations = 0;
    const runner = new EffectRunner(store, {
      execute: async () => { executions += 1; return { outcome: "OUTCOME_UNKNOWN" as const, evidence: ["transport-lost"] }; },
      reconcile: async () => { reconciliations += 1; return { outcome: "SUCCEEDED" as const, remoteIdentity: "remote-after-reconcile" }; }
    });

    const ambiguous = await runner.runAvailable();
    expect(ambiguous[0]).toMatchObject({ status: "RECONCILE", evidence: ["transport-lost", "execution-remains-ambiguous"] });
    expect(executions).toBe(1);
    expect(reconciliations).toBe(0);

    const reconciled = await runner.runAvailable();
    expect(reconciled[0]).toMatchObject({ status: "SUCCEEDED", remoteIdentity: "remote-after-reconcile" });
    expect(executions).toBe(1);
    expect(reconciliations).toBe(1);
    store.close();
  });

  it("honors retry backoff and terminally exhausts the attempt budget", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-effect-retry-policy`);
    await store.open();
    await store.enqueueEffect({ ...effect(), retryPolicy: { maxAttempts: 2, backoffSeconds: 60 } });
    let executions = 0;
    const runner = new EffectRunner(store, { execute: async () => { executions += 1; return { outcome: "FAILED_RETRYABLE" as const, evidence: ["offline"] }; } });

    const first = await runner.runAvailable();
    expect(first[0]).toMatchObject({ status: "FAILED_RETRYABLE", retryCount: 1, nextAttemptAt: expect.any(String) });
    expect(await runner.runAvailable()).toEqual([]);
    expect(executions).toBe(1);
    const waiting = await store.getEffect("runner-effect");
    if (!waiting) throw new Error("Expected persisted retryable effect");
    await store.updateEffect({ ...waiting, nextAttemptAt: new Date(Date.now() - 1).toISOString() }, "FAILED_RETRYABLE");
    const second = await runner.runAvailable();
    expect(second[0]).toMatchObject({ status: "FAILED_TERMINAL", retryCount: 2, nextAttemptAt: undefined, evidence: ["offline", "offline", "retry-limit-reached"] });
    expect(executions).toBe(2);
    store.close();
  });

  it("leaves an interrupted operation visible when no reconciliation adapter exists", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-effect-no-reconcile`);
    await store.open();
    await store.enqueueEffect(effect("IN_FLIGHT"));
    let executions = 0;
    const runner = new EffectRunner(store, { execute: async () => { executions += 1; return { outcome: "SUCCEEDED" }; } });
    const result = await runner.runAvailable();
    expect(executions).toBe(0);
    expect(result[0]?.status).toBe("RECONCILE");
    expect((await store.getEffect("runner-effect"))?.status).toBe("RECONCILE");
    store.close();
  });

  it("does not replay an expired or revoked operation", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-effect-guard`);
    await store.open();
    await store.enqueueEffect({ ...effect(), operationId: "expired-effect", idempotencyKey: "expired-effect-key", expiresAt: "2020-01-01T00:00:00.000Z" });
    await store.enqueueEffect({ ...effect(), operationId: "revoked-effect", idempotencyKey: "revoked-effect-key", credentialHandle: "credential:revoked" });
    let executions = 0;
    const runner = new EffectRunner(store, { execute: async () => { executions += 1; return { outcome: "SUCCEEDED" }; } }, { authorize: async (operation) => { if (operation.credentialHandle) throw new Error("revoked"); } });
    const results = await runner.runAvailable();
    expect(executions).toBe(0);
    expect(results.map((result) => result.status)).toEqual(["EXPIRED", "CANCELLED"]);
    store.close();
  });

  it("does not execute an operation through a different configured destination", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-effect-destination`);
    await store.open();
    await store.enqueueEffect(effect());
    let executions = 0;
    const runner = new EffectRunner(store, {
      supports: () => false,
      execute: async () => { executions += 1; return { outcome: "SUCCEEDED" as const }; }
    });
    await expect(runner.runAvailable()).resolves.toEqual([]);
    expect(executions).toBe(0);
    expect(await store.getEffect("runner-effect")).toMatchObject({ status: "PENDING", destination: "test://destination" });
    store.close();
  });

  it("cancels a pending brokered operation after the credential is revoked", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-effect-revocation`);
    await store.open();
    const broker = new CredentialKeyBroker();
    const metadata = broker.issue("secret-never-used", { provider: "test", scope: ["write"], audience: "remote" });
    await store.enqueueEffect({ ...effect(), credentialHandle: metadata.handleId });
    broker.revoke(metadata.handleId);
    let executions = 0;
    const runner = new EffectRunner(store, { execute: async () => { executions += 1; return { outcome: "SUCCEEDED" as const }; } }, { authorize: async (operation) => broker.authorizeEffect(operation) });
    await expect(runner.runAvailable()).resolves.toMatchObject([{ status: "CANCELLED" }]);
    expect(executions).toBe(0);
    expect(await store.getEffect("runner-effect")).toMatchObject({ status: "CANCELLED", evidence: ["effect-guard-denied"] });
    store.close();
  });

  it("claims a pending operation atomically so concurrent runners execute it once", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-effect-claim`);
    await store.open();
    await store.enqueueEffect(effect());
    let executions = 0;
    let started!: () => void;
    const executionStarted = new Promise<void>((resolve) => { started = resolve; });
    let release!: () => void;
    const releaseExecution = new Promise<void>((resolve) => { release = resolve; });
    const executor = {
      execute: async () => {
        executions += 1;
        started();
        await releaseExecution;
        return { outcome: "SUCCEEDED" as const };
      }
    };
    const first = new EffectRunner(store, executor).runAvailable();
    const second = new EffectRunner(store, executor).runAvailable();
    await executionStarted;
    release();
    await Promise.all([first, second]);
    expect(executions).toBe(1);
    expect(await store.getEffect("runner-effect")).toMatchObject({ status: "SUCCEEDED" });
    store.close();
  });
});
