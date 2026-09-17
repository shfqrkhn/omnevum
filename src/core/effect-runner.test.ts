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
      execute: async (operation) => {
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
});
