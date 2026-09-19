import { assertEffectOperation, transitionEffect, type EffectAuthorization, type EffectOperation } from "./effect";
import { createOpaqueId } from "./id";
import { parseRemoteEndpoint } from "./remote";
import type { CanonicalStore } from "./storage";

export const DEFAULT_EXTERNAL_EFFECT_RETRY_POLICY = { maxAttempts: 3, backoffSeconds: 60 } as const;

export interface ExternalEffectRequest {
  destination: string;
  purpose: string;
  payloadOrReference: Record<string, unknown> | string;
  expiresAt?: string;
  authorization?: EffectAuthorization;
}

export function createExternalEffect(input: ExternalEffectRequest, now = new Date()): EffectOperation {
  const destination = parseRemoteEndpoint(input.destination).href;
  const operation: EffectOperation = {
    operationId: createOpaqueId("effect"),
    owner: "platform.effect",
    originatingCommand: "effect.enqueue",
    purpose: input.purpose.trim(),
    destination,
    payloadOrReference: input.payloadOrReference,
    idempotencyKey: createOpaqueId("effect-key"),
    createdAt: now.toISOString(),
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
    status: "PENDING",
    retryCount: 0,
    retryPolicy: { ...DEFAULT_EXTERNAL_EFFECT_RETRY_POLICY },
    ...(input.authorization ? { authorization: structuredClone(input.authorization) } : {}),
    evidence: ["staged-by-user"]
  };
  assertEffectOperation(operation);
  return operation;
}

/**
 * Withdraw an effect only while it is still staged and no transport has been
 * allowed to observe it. Once execution starts, the result must be reconciled
 * rather than presented as an undoable local action.
 */
export async function withdrawDeferredEffect(store: CanonicalStore, operationId: string): Promise<EffectOperation> {
  const operation = await store.getEffect(operationId);
  if (!operation) throw new Error("The external effect is no longer available");
  if (operation.status !== "PENDING") throw new Error("The external effect is no longer undoable; reconcile its persisted outcome instead");
  const withdrawn = transitionEffect(operation, "CANCELLED", { evidence: [...operation.evidence, "withdrawn-before-delivery"] });
  await store.updateEffect(withdrawn, "PENDING");
  return withdrawn;
}
