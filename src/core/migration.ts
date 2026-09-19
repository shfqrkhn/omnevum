import type { CanonicalRecord, VaultDocument } from "./model";
import { CURRENT_SCHEMA_VERSION, VAULT_FORMAT_VERSION } from "./model";
import { assertCanonicalRecord, assertVaultDocument } from "./validation";

export interface MigrationReceipt {
  fromVersion: number;
  toVersion: number;
  changed: boolean;
  steps: string[];
}

export type UpdateKind = "SHELL_ONLY" | "CANONICAL_SCHEMA";
export type UpdateDecision = "APPLY_SILENTLY" | "REQUIRE_APPROVAL" | "APPLY_AFTER_APPROVAL";
export type ShellActivationDecision = "ACTIVATE" | "READ_COMPATIBLE" | "REFUSE_CONTROL";
export type BackupState = "NOT_REQUIRED" | "CURRENT" | "STALE" | "MISSING";

export interface MigrationPlan {
  id: string;
  description: string;
  affectedRecordClasses: string[];
  fromSchemaVersion: number;
  toSchemaVersion: number;
}

export interface UpdateCandidate {
  releaseId: string;
  shellVersion: string;
  sourceRevision: string;
  artifactDigest: string;
  kind: UpdateKind;
  currentSchemaVersion: number;
  targetSchemaVersion: number;
  migrations: MigrationPlan[];
  rollbackPath: string;
  readCompatible: boolean;
}

export interface VerifiedBackup {
  verifiedAt: string;
  digest: string;
  recordCount: number;
  artifactCount: number;
}

export interface UpdateEvaluation {
  decision: UpdateDecision;
  backupState: BackupState;
  backupRequired: boolean;
  migrationApproved: boolean;
  affectedRecordClasses: string[];
  migrationIds: string[];
  rollbackPath: string;
  reason: string;
}

export interface ShellActivationEvaluation {
  decision: ShellActivationDecision;
  usable: boolean;
  migrationApproved: boolean;
  reason: string;
}

export interface UpdateLedgerEntry {
  releaseId: string;
  shellVersion: string;
  sourceRevision: string;
  artifactDigest: string;
  kind: UpdateKind;
  recordedAt: string;
  decision: UpdateDecision;
  rollbackPath: string;
}

export function migrateRecord(value: unknown, targetVersion: number = CURRENT_SCHEMA_VERSION): { record: CanonicalRecord; receipt: MigrationReceipt } {
  assertCanonicalRecord(value);
  if (targetVersion !== CURRENT_SCHEMA_VERSION || value.schemaVersion > targetVersion) throw new Error("Canonical record schema requires a newer supported runtime");
  return { record: structuredClone(value), receipt: { fromVersion: value.schemaVersion, toVersion: targetVersion, changed: false, steps: [] } };
}

export function migrateVault(value: unknown, targetVersion: number = CURRENT_SCHEMA_VERSION): { vault: VaultDocument; receipt: MigrationReceipt } {
  assertVaultDocument(value);
  if (targetVersion !== CURRENT_SCHEMA_VERSION || value.records.some((record) => record.schemaVersion > targetVersion)) throw new Error("Vault contains a newer unsupported schema");
  return { vault: structuredClone(value), receipt: { fromVersion: CURRENT_SCHEMA_VERSION, toVersion: targetVersion, changed: false, steps: [] } };
}

export function assertCurrentVersions(value: unknown): void {
  if (typeof value === "object" && value !== null && "version" in value && (value as { version?: unknown }).version !== VAULT_FORMAT_VERSION) throw new Error("Unsupported version");
}

export function evaluateUpdate(candidate: UpdateCandidate, now: string, backup?: VerifiedBackup, migrationApproved = false, backupMaxAgeMs = 24 * 60 * 60 * 1000): UpdateEvaluation {
  assertUpdateCandidate(candidate);
  const schemaChange = candidate.kind === "CANONICAL_SCHEMA";
  const backupState = schemaChange ? classifyBackup(backup, now, backupMaxAgeMs) : "NOT_REQUIRED";
  const backupRequired = schemaChange && backupState !== "CURRENT";
  const affectedRecordClasses = [...new Set(candidate.migrations.flatMap((migration) => migration.affectedRecordClasses))].sort();
  if (!schemaChange) return { decision: "APPLY_SILENTLY", backupState, backupRequired: false, migrationApproved: false, affectedRecordClasses, migrationIds: candidate.migrations.map((migration) => migration.id), rollbackPath: candidate.rollbackPath, reason: "Shell-only update has no canonical schema migration and may apply silently." };
  if (!migrationApproved || backupRequired) {
    const backupMessage = backupState === "CURRENT" ? "a verified recent backup is available" : backupState === "MISSING" ? "no verified backup is available" : "the verified backup is stale";
    return { decision: "REQUIRE_APPROVAL", backupState, backupRequired, migrationApproved, affectedRecordClasses, migrationIds: candidate.migrations.map((migration) => migration.id), rollbackPath: candidate.rollbackPath, reason: `Canonical schema migration requires explicit approval; ${backupMessage}. Affected record classes: ${affectedRecordClasses.join(", ") || "none"}. Rollback: ${candidate.rollbackPath}` };
  }
  return { decision: "APPLY_AFTER_APPROVAL", backupState, backupRequired: false, migrationApproved: true, affectedRecordClasses, migrationIds: candidate.migrations.map((migration) => migration.id), rollbackPath: candidate.rollbackPath, reason: `Canonical schema migration is approved with a current verified backup. Rollback: ${candidate.rollbackPath}` };
}

export function evaluateShellActivation(candidate: UpdateCandidate, migrationApproved: boolean): ShellActivationEvaluation {
  assertUpdateCandidate(candidate);
  if (candidate.kind === "SHELL_ONLY") return { decision: "ACTIVATE", usable: true, migrationApproved: false, reason: "Shell-only candidate may take control without changing canonical schema." };
  if (migrationApproved) return { decision: "ACTIVATE", usable: true, migrationApproved: true, reason: "Approved schema candidate may take control after its migration gate completes." };
  if (candidate.readCompatible) return { decision: "READ_COMPATIBLE", usable: true, migrationApproved: false, reason: "Schema migration is unapproved; candidate remains read-compatible and performs no migration." };
  return { decision: "REFUSE_CONTROL", usable: true, migrationApproved: false, reason: "Schema migration is unapproved; candidate refuses control and leaves the current shell active." };
}

export function interruptedMigration(candidate: UpdateCandidate): { canonicalData: "RETAIN_CURRENT_SCHEMA"; shell: "CURRENT_SHELL"; rollbackPath: string; reason: string } {
  assertUpdateCandidate(candidate);
  if (candidate.kind !== "CANONICAL_SCHEMA") throw new Error("Only a canonical schema update can be interrupted");
  return { canonicalData: "RETAIN_CURRENT_SCHEMA", shell: "CURRENT_SHELL", rollbackPath: candidate.rollbackPath, reason: `Migration ${candidate.migrations.map((migration) => migration.id).join(", ") || "candidate"} was interrupted; no canonical reset is permitted. Rollback: ${candidate.rollbackPath}` };
}

export function makeUpdateLedgerEntry(candidate: UpdateCandidate, recordedAt: string, evaluation: Pick<UpdateEvaluation, "decision">): UpdateLedgerEntry {
  assertUpdateCandidate(candidate);
  return { releaseId: candidate.releaseId, shellVersion: candidate.shellVersion, sourceRevision: candidate.sourceRevision, artifactDigest: candidate.artifactDigest, kind: candidate.kind, recordedAt, decision: evaluation.decision, rollbackPath: candidate.rollbackPath };
}

function classifyBackup(backup: VerifiedBackup | undefined, now: string, maxAgeMs: number): BackupState {
  if (!backup) return "MISSING";
  const verifiedAt = Date.parse(backup.verifiedAt);
  const currentAt = Date.parse(now);
  if (!Number.isFinite(verifiedAt) || !Number.isFinite(currentAt) || verifiedAt > currentAt || currentAt - verifiedAt > maxAgeMs || !/^[a-f0-9]{64}$/iu.test(backup.digest) || !Number.isSafeInteger(backup.recordCount) || backup.recordCount < 0 || !Number.isSafeInteger(backup.artifactCount) || backup.artifactCount < 0) return "STALE";
  return "CURRENT";
}

function assertUpdateCandidate(candidate: UpdateCandidate): void {
  if (!/^[a-z][a-z0-9._-]{1,80}$/u.test(candidate.releaseId) || !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/u.test(candidate.shellVersion) || !candidate.sourceRevision.trim() || !/^[a-f0-9]{64}$/iu.test(candidate.artifactDigest) || !["SHELL_ONLY", "CANONICAL_SCHEMA"].includes(candidate.kind) || !Number.isSafeInteger(candidate.currentSchemaVersion) || !Number.isSafeInteger(candidate.targetSchemaVersion) || !candidate.rollbackPath.trim() || !Array.isArray(candidate.migrations)) throw new Error("Invalid update candidate");
  const schemaChange = candidate.kind === "CANONICAL_SCHEMA";
  if (schemaChange !== (candidate.targetSchemaVersion > candidate.currentSchemaVersion) || (schemaChange && candidate.migrations.length === 0) || (!schemaChange && (candidate.migrations.length > 0 || candidate.targetSchemaVersion !== candidate.currentSchemaVersion))) throw new Error("Update candidate schema classification is inconsistent");
  for (const migration of candidate.migrations) {
    if (!/^[a-z][a-z0-9._-]{1,80}$/u.test(migration.id) || !migration.description.trim() || !Array.isArray(migration.affectedRecordClasses) || migration.affectedRecordClasses.some((value) => !value.trim()) || migration.fromSchemaVersion >= migration.toSchemaVersion) throw new Error("Invalid migration plan");
  }
}
