export type TelemetryFactId = "replication" | "backup" | "outbox" | "capability" | "conflict" | "storage";
export type TelemetryHealth = "HEALTHY" | "ATTENTION" | "UNKNOWN";
export type TelemetryStatus = "READY" | "DISABLED" | "CURRENT" | "STALE" | "CLEAR" | "BACKLOGGED" | "DEGRADED" | "UNRESOLVED" | "NORMAL" | "ELEVATED" | "UNKNOWN";
export type TelemetryDispositionState = "OPEN" | "DISMISSED";
export type TelemetryPreviewMode = "healthy" | "backup-stale" | "outbox-backlogged" | "capability-degraded" | "conflict-unresolved" | "storage-elevated" | "all";

export const TELEMETRY_THRESHOLDS_SETTING = "telemetry.thresholds";
export const TELEMETRY_DISPOSITIONS_SETTING = "telemetry.dispositions";

export interface TelemetryThresholds {
  backupMaxAgeMs: number;
  pendingEffects: number;
  unresolvedConflicts: number;
}

export const DEFAULT_TELEMETRY_THRESHOLDS: TelemetryThresholds = {
  backupMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
  pendingEffects: 1,
  unresolvedConflicts: 1
};

export const TELEMETRY_PREVIEW_MODES: readonly TelemetryPreviewMode[] = ["healthy", "backup-stale", "outbox-backlogged", "capability-degraded", "conflict-unresolved", "storage-elevated", "all"];

export interface TelemetryFact {
  id: TelemetryFactId;
  status: TelemetryStatus;
  health: TelemetryHealth;
  evidence: string[];
}

export interface TelemetrySnapshot {
  facts: TelemetryFact[];
  attentionCount: number;
  unknownCount: number;
}

export interface TelemetryDisposition {
  fingerprint: string;
  state: "DISMISSED";
  changedAt: string;
}

export type TelemetryDispositions = Partial<Record<TelemetryFactId, TelemetryDisposition>>;

export interface TelemetryConsideration {
  fact: TelemetryFact;
  fingerprint: string;
  disposition: TelemetryDispositionState;
}

export interface TelemetryInput {
  replication: { enabled: boolean } | "UNKNOWN";
  backup: { lastVerifiedAt?: string; maxAgeMs?: number } | "UNKNOWN";
  pendingEffects: number | "UNKNOWN";
  degradedCapabilities: readonly string[] | "UNKNOWN";
  unresolvedConflicts: number | "UNKNOWN";
  storagePressure: "NORMAL" | "ELEVATED" | "UNKNOWN";
  thresholds?: TelemetryThresholds;
  now?: Date;
}

export function parseTelemetryPreviewMode(value: string | null, loopback: boolean): TelemetryPreviewMode | undefined {
  return loopback && value && (TELEMETRY_PREVIEW_MODES as readonly string[]).includes(value) ? value as TelemetryPreviewMode : undefined;
}

export function makeTelemetryPreviewInput(mode: TelemetryPreviewMode, now = new Date()): TelemetryInput {
  const currentBackup = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const staleBackup = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const input: TelemetryInput = {
    replication: { enabled: false },
    backup: { lastVerifiedAt: currentBackup },
    pendingEffects: 0,
    degradedCapabilities: [],
    unresolvedConflicts: 0,
    storagePressure: "NORMAL",
    now
  };
  if (mode === "backup-stale" || mode === "all") input.backup = { lastVerifiedAt: staleBackup };
  if (mode === "outbox-backlogged" || mode === "all") input.pendingEffects = 2;
  if (mode === "capability-degraded" || mode === "all") input.degradedCapabilities = ["preview.capability"];
  if (mode === "conflict-unresolved" || mode === "all") input.unresolvedConflicts = 1;
  if (mode === "storage-elevated" || mode === "all") input.storagePressure = "ELEVATED";
  return input;
}

export function projectTelemetry(input: TelemetryInput): TelemetrySnapshot {
  const thresholds = parseTelemetryThresholds(input.thresholds);
  const facts: TelemetryFact[] = [
    projectReplication(input.replication),
    projectBackup(input.backup, input.now ?? new Date(), thresholds),
    projectOutbox(input.pendingEffects, thresholds),
    projectCapability(input.degradedCapabilities),
    projectConflicts(input.unresolvedConflicts, thresholds),
    projectStorage(input.storagePressure)
  ];
  return {
    facts,
    attentionCount: facts.filter((fact) => fact.health === "ATTENTION").length,
    unknownCount: facts.filter((fact) => fact.health === "UNKNOWN").length
  };
}

export function parseTelemetryThresholds(value: unknown): TelemetryThresholds {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_TELEMETRY_THRESHOLDS };
  const candidate = value as Record<string, unknown>;
  return {
    backupMaxAgeMs: boundedPositiveInteger(candidate.backupMaxAgeMs, DEFAULT_TELEMETRY_THRESHOLDS.backupMaxAgeMs, 60 * 60 * 1000, 365 * 24 * 60 * 60 * 1000),
    pendingEffects: boundedPositiveInteger(candidate.pendingEffects, DEFAULT_TELEMETRY_THRESHOLDS.pendingEffects, 1, 100_000),
    unresolvedConflicts: boundedPositiveInteger(candidate.unresolvedConflicts, DEFAULT_TELEMETRY_THRESHOLDS.unresolvedConflicts, 1, 100_000)
  };
}

export function parseTelemetryDispositions(value: unknown): TelemetryDispositions {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const candidate = value as Record<string, unknown>;
  const result: TelemetryDispositions = {};
  for (const id of ["replication", "backup", "outbox", "capability", "conflict", "storage"] as const) {
    const entry = candidate[id];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const disposition = entry as Record<string, unknown>;
    if (typeof disposition.fingerprint !== "string" || disposition.fingerprint.length === 0 || disposition.fingerprint.length > 240 || disposition.state !== "DISMISSED" || typeof disposition.changedAt !== "string") continue;
    result[id] = { fingerprint: disposition.fingerprint, state: "DISMISSED", changedAt: disposition.changedAt };
  }
  return result;
}

export function telemetryFactFingerprint(fact: TelemetryFact): string {
  const stableEvidence = fact.id === "backup" ? "" : fact.evidence.join("|");
  return `${fact.id}:${fact.status}:${stableEvidence}`.slice(0, 240);
}

export function projectTelemetryConsiderations(snapshot: TelemetrySnapshot, dispositions: TelemetryDispositions = {}): TelemetryConsideration[] {
  return snapshot.facts
    .filter((fact) => fact.health === "ATTENTION")
    .map((fact) => {
      const fingerprint = telemetryFactFingerprint(fact);
      const saved = dispositions[fact.id];
      return { fact, fingerprint, disposition: saved?.fingerprint === fingerprint ? "DISMISSED" : "OPEN" } satisfies TelemetryConsideration;
    });
}

function projectReplication(input: TelemetryInput["replication"]): TelemetryFact {
  if (input === "UNKNOWN") return fact("replication", "UNKNOWN", "UNKNOWN", "replication state unavailable");
  return input.enabled ? fact("replication", "READY", "HEALTHY", "replication route enabled") : fact("replication", "DISABLED", "HEALTHY", "replication route disabled by policy");
}

function projectBackup(input: TelemetryInput["backup"], now: Date, thresholds: TelemetryThresholds): TelemetryFact {
  if (input === "UNKNOWN" || !input.lastVerifiedAt) return fact("backup", "UNKNOWN", "UNKNOWN", "no verified off-origin backup timestamp");
  const verifiedAt = Date.parse(input.lastVerifiedAt);
  const maxAgeMs = input.maxAgeMs ?? thresholds.backupMaxAgeMs;
  if (!Number.isFinite(verifiedAt) || !Number.isFinite(maxAgeMs) || maxAgeMs <= 0) return fact("backup", "UNKNOWN", "UNKNOWN", "backup timestamp or age policy is invalid");
  const ageMs = now.getTime() - verifiedAt;
  if (ageMs < 0) return fact("backup", "UNKNOWN", "UNKNOWN", "backup timestamp is in the future");
  return ageMs <= maxAgeMs ? fact("backup", "CURRENT", "HEALTHY", `verified ${Math.floor(ageMs / 1000)} seconds ago`) : fact("backup", "STALE", "ATTENTION", `verified ${Math.floor(ageMs / 1000)} seconds ago`);
}

function projectOutbox(input: TelemetryInput["pendingEffects"], thresholds: TelemetryThresholds): TelemetryFact {
  if (input === "UNKNOWN") return fact("outbox", "UNKNOWN", "UNKNOWN", "external-effect backlog unavailable");
  if (!Number.isSafeInteger(input) || input < 0) return fact("outbox", "UNKNOWN", "UNKNOWN", "external-effect backlog is invalid");
  return input < thresholds.pendingEffects ? fact("outbox", "CLEAR", "HEALTHY", "no pending or uncertain effects above the configured threshold") : fact("outbox", "BACKLOGGED", "ATTENTION", `${input} pending or uncertain effect(s); threshold ${thresholds.pendingEffects}`);
}

function projectCapability(input: TelemetryInput["degradedCapabilities"]): TelemetryFact {
  if (input === "UNKNOWN") return fact("capability", "UNKNOWN", "UNKNOWN", "capability status unavailable");
  const ids = input.filter((id) => id.trim()).slice(0, 50);
  return ids.length === 0 ? fact("capability", "READY", "HEALTHY", "no degraded capabilities") : fact("capability", "DEGRADED", "ATTENTION", ids.join(", "));
}

function projectConflicts(input: TelemetryInput["unresolvedConflicts"], thresholds: TelemetryThresholds): TelemetryFact {
  if (input === "UNKNOWN") return fact("conflict", "UNKNOWN", "UNKNOWN", "conflict state unavailable");
  if (!Number.isSafeInteger(input) || input < 0) return fact("conflict", "UNKNOWN", "UNKNOWN", "conflict count is invalid");
  return input < thresholds.unresolvedConflicts ? fact("conflict", "CLEAR", "HEALTHY", "no unresolved conflicts above the configured threshold") : fact("conflict", "UNRESOLVED", "ATTENTION", `${input} unresolved conflict(s); threshold ${thresholds.unresolvedConflicts}`);
}

function projectStorage(input: TelemetryInput["storagePressure"]): TelemetryFact {
  if (input === "UNKNOWN") return fact("storage", "UNKNOWN", "UNKNOWN", "storage pressure unavailable");
  return input === "NORMAL" ? fact("storage", "NORMAL", "HEALTHY", "storage pressure is normal") : fact("storage", "ELEVATED", "ATTENTION", "storage pressure is elevated");
}

function fact(id: TelemetryFactId, status: TelemetryStatus, health: TelemetryHealth, evidence: string): TelemetryFact {
  return { id, status, health, evidence: [evidence] };
}

function boundedPositiveInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}
