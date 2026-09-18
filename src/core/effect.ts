import { containsSensitiveKey } from "./safety";

export const EFFECT_STATUSES = ["PENDING", "IN_FLIGHT", "SUCCEEDED", "FAILED_RETRYABLE", "FAILED_TERMINAL", "CANCELLED", "EXPIRED", "OUTCOME_UNKNOWN", "RECONCILE"] as const;
export type EffectStatus = (typeof EFFECT_STATUSES)[number];
export const EFFECT_DISCLOSURE_CLASSES = ["PRIVATE", "SHARED", "PUBLIC"] as const;
export type EffectDisclosureClass = (typeof EFFECT_DISCLOSURE_CLASSES)[number];

export interface EffectAuthorization {
  authority: string;
  permission: string;
  space?: string;
  disclosureClass: EffectDisclosureClass;
  schema: string;
}

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
  retryPolicy: { maxAttempts: number; backoffSeconds: number };
  nextAttemptAt?: string;
  credentialHandle?: string;
  authorization?: EffectAuthorization;
  remoteIdentity?: string;
  evidence: string[];
}

type EffectPatch = { [K in keyof EffectOperation]?: EffectOperation[K] | undefined };

const transitions: Record<EffectStatus, readonly EffectStatus[]> = {
  PENDING: ["IN_FLIGHT", "CANCELLED", "EXPIRED"],
  IN_FLIGHT: ["SUCCEEDED", "FAILED_RETRYABLE", "FAILED_TERMINAL", "OUTCOME_UNKNOWN"],
  SUCCEEDED: [],
  FAILED_RETRYABLE: ["PENDING", "IN_FLIGHT", "CANCELLED", "EXPIRED"],
  FAILED_TERMINAL: [],
  CANCELLED: [],
  EXPIRED: [],
  OUTCOME_UNKNOWN: ["RECONCILE", "CANCELLED"],
  RECONCILE: ["IN_FLIGHT", "SUCCEEDED", "FAILED_RETRYABLE", "FAILED_TERMINAL", "CANCELLED", "EXPIRED"]
};

function containsForbiddenSecretField(value: unknown): boolean {
  return containsSensitiveKey(value);
}

const MAX_EFFECT_TEXT = 500;
const MAX_EFFECT_EVIDENCE = 50;
const MAX_EFFECT_PAYLOAD_DEPTH = 8;
const MAX_EFFECT_PAYLOAD_KEYS = 100;
const MAX_EFFECT_PAYLOAD_STRING = 20_000;

export function assertEffectOperation(operation: unknown): asserts operation is EffectOperation {
  if (!isObject(operation)) throw new Error("Invalid effect operation");
  if (!["operationId", "owner", "originatingCommand", "purpose", "destination", "idempotencyKey"].every((field) => isBoundedText(operation[field]))) throw new Error("Effect operation identity, purpose, and idempotency key are required");
  if (!EFFECT_STATUSES.includes(operation.status as EffectStatus)) throw new Error("Invalid effect operation status");
  if (!Number.isSafeInteger(operation.retryCount) || (operation.retryCount as number) < 0) throw new Error("Invalid effect retry count");
  if (!isRetryPolicy(operation.retryPolicy)) throw new Error("Invalid effect retry policy");
  if (!isTimestamp(operation.createdAt) || !optionalTimestamp(operation.expiresAt) || !optionalTimestamp(operation.nextAttemptAt)) throw new Error("Invalid effect timestamp");
  if (operation.credentialHandle !== undefined && !isBoundedText(operation.credentialHandle)) throw new Error("Invalid effect credential handle");
  if (operation.authorization !== undefined && !isEffectAuthorization(operation.authorization)) throw new Error("Invalid effect authorization context");
  if (operation.remoteIdentity !== undefined && !isBoundedText(operation.remoteIdentity)) throw new Error("Invalid effect remote identity");
  if (typeof operation.payloadOrReference !== "string" && !isObject(operation.payloadOrReference)) throw new Error("Effect payload must be a bounded reference or object");
  if (typeof operation.payloadOrReference === "string" && operation.payloadOrReference.length > MAX_EFFECT_TEXT) throw new Error("Effect payload reference is too large");
  if (typeof operation.payloadOrReference === "object" && !isBoundedPayload(operation.payloadOrReference)) throw new Error("Effect payload must be a bounded reference or object");
  if (!Array.isArray(operation.evidence) || operation.evidence.length > MAX_EFFECT_EVIDENCE || !operation.evidence.every((item) => typeof item === "string" && item.length <= MAX_EFFECT_TEXT)) throw new Error("Effect evidence must be bounded text entries");
  if (containsForbiddenSecretField(operation.payloadOrReference)) throw new Error("Raw credential fields are not allowed in effect payloads");
}

export function canTransitionEffect(from: EffectStatus, to: EffectStatus): boolean {
  return transitions[from].includes(to);
}

export function transitionEffect(operation: EffectOperation, status: EffectStatus, patch: EffectPatch = {}): EffectOperation {
  if (!canTransitionEffect(operation.status, status)) throw new Error(`Invalid effect transition ${operation.status} -> ${status}`);
  const next = { ...operation, ...patch, status };
  assertEffectOperation(next);
  return next;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_EFFECT_TEXT && !/[\u0000\r\n]/.test(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 100 && Number.isFinite(Date.parse(value));
}

function optionalTimestamp(value: unknown): boolean {
  return value === undefined || isTimestamp(value);
}

function isRetryPolicy(value: unknown): value is EffectOperation["retryPolicy"] {
  if (!isObject(value)) return false;
  return Number.isSafeInteger(value.maxAttempts) && (value.maxAttempts as number) >= 0 && (value.maxAttempts as number) <= 1000 && Number.isFinite(value.backoffSeconds) && (value.backoffSeconds as number) >= 0 && (value.backoffSeconds as number) <= 31_536_000;
}

function isEffectAuthorization(value: unknown): value is EffectAuthorization {
  if (!isObject(value) || !isBoundedText(value.authority) || !isBoundedText(value.permission) || !isBoundedText(value.schema)) return false;
  if (value.space !== undefined && !isBoundedText(value.space)) return false;
  return EFFECT_DISCLOSURE_CLASSES.includes(value.disclosureClass as EffectDisclosureClass);
}

function isBoundedPayload(value: Record<string, unknown>, depth = 0): boolean {
  if (depth > MAX_EFFECT_PAYLOAD_DEPTH || Object.keys(value).length > MAX_EFFECT_PAYLOAD_KEYS) return false;
  return Object.entries(value).every(([key, child]) => {
    if (!key || key.length > 160 || key === "__proto__" || key === "prototype" || key === "constructor") return false;
    if (typeof child === "string") return child.length <= MAX_EFFECT_PAYLOAD_STRING;
    if (Array.isArray(child)) return child.length <= 100 && child.every((item) => item === null || typeof item !== "object" || Array.isArray(item) ? item === null || typeof item !== "object" || (Array.isArray(item) && item.length <= 100) : isBoundedPayload(item, depth + 1));
    return child === null || (typeof child === "number" && Number.isFinite(child)) || typeof child === "boolean" || (typeof child === "object" && isObject(child) && isBoundedPayload(child, depth + 1));
  });
}
