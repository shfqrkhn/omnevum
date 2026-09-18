import { describe, expect, it } from "vitest";
import type { EffectOperation } from "./effect";
import { EffectRunner } from "./effect-runner";
import { CanonicalStore } from "./storage";

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
    expect((await store.listEffects())[0]?.retryCount).toBe(1);
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
