import { describe, expect, it } from "vitest";
import { createExternalEffect } from "./effect-service";
import { withdrawDeferredEffect } from "./effect-service";
import { CanonicalStore } from "./storage";

describe("external effect staging", () => {
  it("creates a normalized pending operation without contacting a destination", () => {
    const operation = createExternalEffect({ destination: "https://remote.example.test/action", purpose: "  create item  ", payloadOrReference: { value: "safe" }, authorization: { authority: "local-user", permission: "effect.execute", space: "personal", disclosureClass: "PRIVATE", schema: "effect-json-v1" } }, new Date("2026-01-01T00:00:00.000Z"));
    expect(operation).toMatchObject({ owner: "platform.effect", originatingCommand: "effect.enqueue", purpose: "create item", destination: "https://remote.example.test/action", status: "PENDING", retryCount: 0, createdAt: "2026-01-01T00:00:00.000Z", authorization: { authority: "local-user", permission: "effect.execute", space: "personal", disclosureClass: "PRIVATE", schema: "effect-json-v1" }, evidence: ["staged-by-user"] });
    expect(operation.operationId).toMatch(/^effect_/);
    expect(operation.idempotencyKey).toMatch(/^effect-key_/);
  });

  it("rejects insecure destinations and raw credential-shaped payloads", () => {
    expect(() => createExternalEffect({ destination: "http://remote.example.test/action", purpose: "send", payloadOrReference: {} })).toThrow("HTTPS");
    expect(() => createExternalEffect({ destination: "https://remote.example.test/action", purpose: "send", payloadOrReference: { accessToken: "never" } })).toThrow("Raw credential");
  });

  it("withdraws only a still-pending operation before delivery", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-effect-withdrawal`);
    await store.open();
    const pending = createExternalEffect({ destination: "https://remote.example.test/action", purpose: "withdraw me", payloadOrReference: { value: "safe" } });
    await store.enqueueEffect(pending);

    await expect(withdrawDeferredEffect(store, pending.operationId)).resolves.toMatchObject({ status: "CANCELLED", evidence: ["staged-by-user", "withdrawn-before-delivery"] });
    await expect(store.getEffect(pending.operationId)).resolves.toMatchObject({ status: "CANCELLED" });
    store.close();
  });

  it("does not present started or ambiguous effects as undoable", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-effect-not-undoable`);
    await store.open();
    for (const status of ["IN_FLIGHT", "OUTCOME_UNKNOWN", "RECONCILE", "SUCCEEDED"] as const) {
      const operation = { ...createExternalEffect({ destination: "https://remote.example.test/action", purpose: `not undoable ${status}`, payloadOrReference: { value: status } }), operationId: `effect-${status.toLowerCase()}`, status };
      await store.enqueueEffect(operation);
      await expect(withdrawDeferredEffect(store, operation.operationId)).rejects.toThrow("no longer undoable");
    }
    store.close();
  });
});
