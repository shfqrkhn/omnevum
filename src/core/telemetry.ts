export type TelemetryFactId = "replication" | "backup" | "outbox" | "capability" | "conflict" | "storage";
export type TelemetryHealth = "HEALTHY" | "ATTENTION" | "UNKNOWN";
export type TelemetryStatus = "READY" | "DISABLED" | "CURRENT" | "STALE" | "CLEAR" | "BACKLOGGED" | "DEGRADED" | "UNRESOLVED" | "NORMAL" | "ELEVATED" | "UNKNOWN";

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

export interface TelemetryInput {
  replication: { enabled: boolean } | "UNKNOWN";
  backup: { lastVerifiedAt?: string; maxAgeMs?: number } | "UNKNOWN";
  pendingEffects: number | "UNKNOWN";
  degradedCapabilities: readonly string[] | "UNKNOWN";
  unresolvedConflicts: number | "UNKNOWN";
  storagePressure: "NORMAL" | "ELEVATED" | "UNKNOWN";
  now?: Date;
}

const DEFAULT_BACKUP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function projectTelemetry(input: TelemetryInput): TelemetrySnapshot {
  const facts: TelemetryFact[] = [
    projectReplication(input.replication),
    projectBackup(input.backup, input.now ?? new Date()),
    projectOutbox(input.pendingEffects),
    projectCapability(input.degradedCapabilities),
    projectConflicts(input.unresolvedConflicts),
    projectStorage(input.storagePressure)
  ];
  return {
    facts,
    attentionCount: facts.filter((fact) => fact.health === "ATTENTION").length,
    unknownCount: facts.filter((fact) => fact.health === "UNKNOWN").length
  };
}

function projectReplication(input: TelemetryInput["replication"]): TelemetryFact {
  if (input === "UNKNOWN") return fact("replication", "UNKNOWN", "UNKNOWN", "replication state unavailable");
  return input.enabled ? fact("replication", "READY", "HEALTHY", "replication route enabled") : fact("replication", "DISABLED", "HEALTHY", "replication route disabled by policy");
}

function projectBackup(input: TelemetryInput["backup"], now: Date): TelemetryFact {
  if (input === "UNKNOWN" || !input.lastVerifiedAt) return fact("backup", "UNKNOWN", "UNKNOWN", "no verified off-origin backup timestamp");
  const verifiedAt = Date.parse(input.lastVerifiedAt);
  const maxAgeMs = input.maxAgeMs ?? DEFAULT_BACKUP_MAX_AGE_MS;
  if (!Number.isFinite(verifiedAt) || !Number.isFinite(maxAgeMs) || maxAgeMs <= 0) return fact("backup", "UNKNOWN", "UNKNOWN", "backup timestamp or age policy is invalid");
  const ageMs = now.getTime() - verifiedAt;
  if (ageMs < 0) return fact("backup", "UNKNOWN", "UNKNOWN", "backup timestamp is in the future");
  return ageMs <= maxAgeMs ? fact("backup", "CURRENT", "HEALTHY", `verified ${Math.floor(ageMs / 1000)} seconds ago`) : fact("backup", "STALE", "ATTENTION", `verified ${Math.floor(ageMs / 1000)} seconds ago`);
}

function projectOutbox(input: TelemetryInput["pendingEffects"]): TelemetryFact {
  if (input === "UNKNOWN") return fact("outbox", "UNKNOWN", "UNKNOWN", "external-effect backlog unavailable");
  if (!Number.isSafeInteger(input) || input < 0) return fact("outbox", "UNKNOWN", "UNKNOWN", "external-effect backlog is invalid");
  return input === 0 ? fact("outbox", "CLEAR", "HEALTHY", "no pending or uncertain effects") : fact("outbox", "BACKLOGGED", "ATTENTION", `${input} pending or uncertain effect(s)`);
}

function projectCapability(input: TelemetryInput["degradedCapabilities"]): TelemetryFact {
  if (input === "UNKNOWN") return fact("capability", "UNKNOWN", "UNKNOWN", "capability status unavailable");
  const ids = input.filter((id) => id.trim()).slice(0, 50);
  return ids.length === 0 ? fact("capability", "READY", "HEALTHY", "no degraded capabilities") : fact("capability", "DEGRADED", "ATTENTION", ids.join(", "));
}

function projectConflicts(input: TelemetryInput["unresolvedConflicts"]): TelemetryFact {
  if (input === "UNKNOWN") return fact("conflict", "UNKNOWN", "UNKNOWN", "conflict state unavailable");
  if (!Number.isSafeInteger(input) || input < 0) return fact("conflict", "UNKNOWN", "UNKNOWN", "conflict count is invalid");
  return input === 0 ? fact("conflict", "CLEAR", "HEALTHY", "no unresolved conflicts") : fact("conflict", "UNRESOLVED", "ATTENTION", `${input} unresolved conflict(s)`);
}

function projectStorage(input: TelemetryInput["storagePressure"]): TelemetryFact {
  if (input === "UNKNOWN") return fact("storage", "UNKNOWN", "UNKNOWN", "storage pressure unavailable");
  return input === "NORMAL" ? fact("storage", "NORMAL", "HEALTHY", "storage pressure is normal") : fact("storage", "ELEVATED", "ATTENTION", "storage pressure is elevated");
}

function fact(id: TelemetryFactId, status: TelemetryStatus, health: TelemetryHealth, evidence: string): TelemetryFact {
  return { id, status, health, evidence: [evidence] };
}
