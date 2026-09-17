export const EFFECT_STATUSES = ["PENDING", "IN_FLIGHT", "SUCCEEDED", "FAILED_RETRYABLE", "FAILED_TERMINAL", "CANCELLED", "EXPIRED", "OUTCOME_UNKNOWN", "RECONCILE"] as const;
export type EffectStatus = (typeof EFFECT_STATUSES)[number];

export interface EffectOperation {
  operationId: string;
  owner: string;
  originatingCommand: string;
  purpose: string;
  destination: string;
  payloadOrReference: Record<string, unknown> | string;
  idempotencyKey: string;
  createdAt: string;
  expiresAt?: string;
  status: EffectStatus;
  retryCount: number;
  nextAttemptAt?: string;
  credentialHandle?: string;
  remoteIdentity?: string;
  evidence: string[];
}

const forbiddenSecretFields = /(?:access|refresh)?token|password|secret|privatekey|authorization/i;
const transitions: Record<EffectStatus, readonly EffectStatus[]> = {
  PENDING: ["IN_FLIGHT", "CANCELLED", "EXPIRED"],
  IN_FLIGHT: ["SUCCEEDED", "FAILED_RETRYABLE", "FAILED_TERMINAL", "OUTCOME_UNKNOWN"],
  SUCCEEDED: [],
  FAILED_RETRYABLE: ["PENDING", "IN_FLIGHT", "CANCELLED", "EXPIRED"],
  FAILED_TERMINAL: [],
  CANCELLED: [],
  EXPIRED: [],
  OUTCOME_UNKNOWN: ["RECONCILE", "CANCELLED"],
  RECONCILE: ["IN_FLIGHT", "SUCCEEDED", "FAILED_RETRYABLE", "FAILED_TERMINAL", "CANCELLED"]
};

function containsForbiddenSecretField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenSecretField);
  if (typeof value !== "object" || value === null) return false;
  return Object.entries(value).some(([key, child]) => forbiddenSecretFields.test(key) || containsForbiddenSecretField(child));
}

export function assertEffectOperation(operation: EffectOperation): void {
  if (!operation.operationId || !operation.owner || !operation.originatingCommand || !operation.purpose || !operation.destination || !operation.idempotencyKey) throw new Error("Effect operation identity, purpose, and idempotency key are required");
  if (!EFFECT_STATUSES.includes(operation.status)) throw new Error("Invalid effect operation status");
  if (!Number.isSafeInteger(operation.retryCount) || operation.retryCount < 0) throw new Error("Invalid effect retry count");
  if (typeof operation.payloadOrReference !== "string" && (typeof operation.payloadOrReference !== "object" || operation.payloadOrReference === null || Array.isArray(operation.payloadOrReference))) throw new Error("Effect payload must be a bounded reference or object");
  if (!Array.isArray(operation.evidence) || !operation.evidence.every((item) => typeof item === "string")) throw new Error("Effect evidence must be text entries");
  if (containsForbiddenSecretField(operation.payloadOrReference)) throw new Error("Raw credential fields are not allowed in effect payloads");
}

export function canTransitionEffect(from: EffectStatus, to: EffectStatus): boolean {
  return transitions[from].includes(to);
}

export function transitionEffect(operation: EffectOperation, status: EffectStatus, patch: Partial<EffectOperation> = {}): EffectOperation {
  if (!canTransitionEffect(operation.status, status)) throw new Error(`Invalid effect transition ${operation.status} -> ${status}`);
  const next = { ...operation, ...patch, status };
  assertEffectOperation(next);
  return next;
}
