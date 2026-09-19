export const UPDATE_LEDGER_SETTING = "updates.shellLedger";
export const UPDATE_LEDGER_SCHEMA_VERSION = 1 as const;
export const MAX_UPDATE_LEDGER_ENTRIES = 12;

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
