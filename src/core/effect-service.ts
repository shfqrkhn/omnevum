import { assertEffectOperation, type EffectAuthorization, type EffectOperation } from "./effect";
import { createOpaqueId } from "./id";
import { parseRemoteEndpoint } from "./remote";

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
