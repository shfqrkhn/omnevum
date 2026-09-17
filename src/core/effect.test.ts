import { describe, expect, it } from "vitest";
import { assertEffectOperation, canTransitionEffect, transitionEffect, type EffectOperation } from "./effect";

function operation(): EffectOperation {
  return {
    operationId: "op-1",
    owner: "platform.test",
    originatingCommand: "test.command",
    purpose: "test effect",
    destination: "test://destination",
  payloadOrReference: { value: "safe" },
  idempotencyKey: "effect-test-idempotency",
    createdAt: new Date().toISOString(),
    status: "PENDING",
    retryCount: 0,
    evidence: []
  };
}

describe("Effect/Outbox contract", () => {
  it("allows only truthful state transitions", () => {
    expect(canTransitionEffect("PENDING", "IN_FLIGHT")).toBe(true);
    expect(canTransitionEffect("SUCCEEDED", "PENDING")).toBe(false);
    expect(transitionEffect(operation(), "IN_FLIGHT").status).toBe("IN_FLIGHT");
    expect(() => transitionEffect(operation(), "SUCCEEDED")).toThrow("Invalid effect transition");
  });

  it("rejects raw credential-shaped payload fields", () => {
    expect(() => assertEffectOperation({ ...operation(), payloadOrReference: { accessToken: "never" } })).toThrow("Raw credential");
  });
});
