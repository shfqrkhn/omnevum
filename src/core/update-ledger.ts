import type { MigrationJournal } from "./migration";
import { isMigrationJournal } from "./migration";

export const UPDATE_LEDGER_SETTING = "updates.shellLedger";
export const UPDATE_LEDGER_SCHEMA_VERSION = 1 as const;
export const MAX_UPDATE_LEDGER_ENTRIES = 12;
export const MIGRATION_LEDGER_SETTING = "updates.migrationLedger";
export const CLIENT_FENCE_SETTING = "updates.clientFence";
export const CLIENT_FENCE_SCHEMA_VERSION = 1 as const;
export const MAX_MIGRATION_LEDGER_ENTRIES = 8;

export type ShellLedgerDecision = "ACTIVATED" | "WAITING" | "ROLLED_BACK";

export interface ShellUpdateLedgerEntry {
  schemaVersion: typeof UPDATE_LEDGER_SCHEMA_VERSION;
  releaseId: string;
  shellVersion: string;
  cacheName: string;
  observedAt: string;
  decision: ShellLedgerDecision;
  rollbackPath: string;
}

export interface ShellUpdateObservation {
  releaseId: string;
  shellVersion?: string;
  cacheName: string;
  observedAt: string;
  decision: ShellLedgerDecision;
  rollbackPath: string;
}

export interface ClientFenceState {
  schemaVersion: typeof CLIENT_FENCE_SCHEMA_VERSION;
  epoch: number;
  canonicalFingerprint: string;
  changedAt: string;
}

export interface ClientLease {
  schemaVersion: typeof CLIENT_FENCE_SCHEMA_VERSION;
  clientId: string;
  epoch: number;
  canonicalFingerprint: string;
  issuedAt: string;
}

export type ClientFenceDecision = "ALLOW_WRITE" | "READ_ONLY" | "RELOAD_REQUIRED";

export interface ClientFenceEvaluation {
  decision: ClientFenceDecision;
  stale: boolean;
  reason: string;
}

export function parseShellUpdateLedger(value: unknown): ShellUpdateLedgerEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isShellUpdateLedgerEntry).slice(0, MAX_UPDATE_LEDGER_ENTRIES).map((entry) => structuredClone(entry));
}

export function appendShellUpdateObservation(current: unknown, observation: ShellUpdateObservation): ShellUpdateLedgerEntry[] {
  const entry = makeShellUpdateLedgerEntry(observation);
  const existing = parseShellUpdateLedger(current);
  const withoutSameObservation = existing.filter((candidate) => !(candidate.releaseId === entry.releaseId && candidate.decision === entry.decision));
  return [entry, ...withoutSameObservation].slice(0, MAX_UPDATE_LEDGER_ENTRIES);
}

export function isShellUpdateLedgerEntry(value: unknown): value is ShellUpdateLedgerEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<ShellUpdateLedgerEntry>;
  return candidate.schemaVersion === UPDATE_LEDGER_SCHEMA_VERSION
    && isBoundedText(candidate.releaseId, 160)
    && isBoundedText(candidate.shellVersion, 160)
    && isCacheName(candidate.cacheName)
    && isIsoDate(candidate.observedAt)
    && (candidate.decision === "ACTIVATED" || candidate.decision === "WAITING" || candidate.decision === "ROLLED_BACK")
    && isBoundedText(candidate.rollbackPath, 500);
}

export function parseMigrationLedger(value: unknown): MigrationJournal[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isMigrationJournal).slice(0, MAX_MIGRATION_LEDGER_ENTRIES).map((entry) => structuredClone(entry));
}

export function appendMigrationJournal(current: unknown, journal: MigrationJournal): MigrationJournal[] {
  if (!isMigrationJournal(journal)) throw new Error("Invalid schema migration journal");
  const existing = parseMigrationLedger(current);
  return [structuredClone(journal), ...existing.filter((entry) => entry.journalId !== journal.journalId)].slice(0, MAX_MIGRATION_LEDGER_ENTRIES);
}

export function parseClientFenceState(value: unknown): ClientFenceState | undefined {
  if (!isClientFenceState(value)) return undefined;
  return structuredClone(value);
}

export function makeClientFenceState(canonicalFingerprint: string, changedAt: string, epoch = 0): ClientFenceState {
  const state: ClientFenceState = { schemaVersion: CLIENT_FENCE_SCHEMA_VERSION, epoch, canonicalFingerprint: canonicalFingerprint.toLowerCase(), changedAt };
  if (!isClientFenceState(state)) throw new Error("Invalid client fence state");
  return state;
}

export function advanceClientFence(current: unknown, canonicalFingerprint: string, changedAt: string): ClientFenceState {
  const state = parseClientFenceState(current);
  if (!state) throw new Error("Cannot advance an invalid or missing client fence");
  return makeClientFenceState(canonicalFingerprint, changedAt, state.epoch + 1);
}

export function issueClientLease(current: unknown, clientId: string, issuedAt: string): ClientLease {
  const state = parseClientFenceState(current);
  if (!state || !isClientId(clientId) || !isIsoDate(issuedAt)) throw new Error("Cannot issue a lease from an invalid client fence");
  return { schemaVersion: CLIENT_FENCE_SCHEMA_VERSION, clientId: clientId.trim(), epoch: state.epoch, canonicalFingerprint: state.canonicalFingerprint, issuedAt };
}

export function evaluateClientFence(current: unknown, lease: unknown): ClientFenceEvaluation {
  const state = parseClientFenceState(current);
  if (!state || !isClientLease(lease)) return { decision: "RELOAD_REQUIRED", stale: true, reason: "Client fence state or lease is invalid; reload and reconcile before writing." };
  if (lease.epoch !== state.epoch) return { decision: "RELOAD_REQUIRED", stale: true, reason: "Client lease is stale after a canonical state transition; reload before writing." };
  if (lease.canonicalFingerprint !== state.canonicalFingerprint) return { decision: "READ_ONLY", stale: true, reason: "Client lease does not match the current canonical fingerprint; remain read-only until reconciled." };
  return { decision: "ALLOW_WRITE", stale: false, reason: "Client lease matches the current canonical fence." };
}

export function assertClientCanWrite(current: unknown, lease: unknown): void {
  const evaluation = evaluateClientFence(current, lease);
  if (evaluation.decision !== "ALLOW_WRITE") throw new Error(evaluation.reason);
}

function makeShellUpdateLedgerEntry(observation: ShellUpdateObservation): ShellUpdateLedgerEntry {
  const entry: ShellUpdateLedgerEntry = {
    schemaVersion: UPDATE_LEDGER_SCHEMA_VERSION,
    releaseId: observation.releaseId.trim(),
    shellVersion: (observation.shellVersion ?? observation.releaseId).trim(),
    cacheName: observation.cacheName.trim(),
    observedAt: observation.observedAt,
    decision: observation.decision,
    rollbackPath: observation.rollbackPath.trim()
  };
  if (!isShellUpdateLedgerEntry(entry)) throw new Error("Invalid service-worker update observation");
  return entry;
}

function isBoundedText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function isCacheName(value: unknown): value is string {
  return typeof value === "string" && /^omnevum-shell-[a-z0-9._-]{1,120}$/u.test(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isDigest(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/iu.test(value);
}

function isClientId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 160 && !/[\u0000\r\n]/u.test(value);
}

function isClientFenceState(value: unknown): value is ClientFenceState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<ClientFenceState>;
  const epoch = candidate.epoch;
  return candidate.schemaVersion === CLIENT_FENCE_SCHEMA_VERSION && typeof epoch === "number" && Number.isSafeInteger(epoch) && epoch >= 0 && isDigest(candidate.canonicalFingerprint) && isIsoDate(candidate.changedAt);
}

function isClientLease(value: unknown): value is ClientLease {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<ClientLease>;
  const epoch = candidate.epoch;
  return candidate.schemaVersion === CLIENT_FENCE_SCHEMA_VERSION && isClientId(candidate.clientId) && typeof epoch === "number" && Number.isSafeInteger(epoch) && epoch >= 0 && isDigest(candidate.canonicalFingerprint) && isIsoDate(candidate.issuedAt);
}
