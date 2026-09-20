import type { CanonicalRecord, VaultDocument } from "./model";
import { CURRENT_SCHEMA_VERSION, VAULT_FORMAT_VERSION } from "./model";
import { assertCanonicalRecord, assertVaultDocument } from "./validation";
import { fingerprintVault, verifyVaultIntegrity } from "./vault";

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
export const MIGRATION_JOURNAL_SCHEMA_VERSION = 1 as const;
export type MigrationJournalState = "PREPARED" | "RUNNING" | "INTERRUPTED" | "REPAIR_REQUIRED" | "COMPLETED" | "ROLLED_BACK";
export type MigrationRepairAction = "RESUME" | "ROLLBACK";

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

export interface MigrationApproval {
  schemaVersion: typeof MIGRATION_JOURNAL_SCHEMA_VERSION;
  releaseId: string;
  sourceRevision: string;
  artifactDigest: string;
  currentSchemaVersion: number;
  targetSchemaVersion: number;
  migrationIds: string[];
  sourceFingerprint: string;
  backupFingerprint: string;
  clientEpoch: number;
  approvedAt: string;
}

export interface MigrationJournal {
  kind: "SCHEMA_MIGRATION_JOURNAL";
  schemaVersion: typeof MIGRATION_JOURNAL_SCHEMA_VERSION;
  journalId: string;
  releaseId: string;
  shellVersion: string;
  sourceRevision: string;
  artifactDigest: string;
  currentSchemaVersion: number;
  targetSchemaVersion: number;
  migrationIds: string[];
  sourceFingerprint: string;
  backupFingerprint: string;
  backup: VaultDocument;
  canonicalFingerprint: string;
  clientEpoch: number;
  state: MigrationJournalState;
  completedMigrationIds: string[];
  startedAt: string;
  updatedAt: string;
}

export interface MigrationRepairResult {
  action: MigrationRepairAction;
  journal: MigrationJournal;
  restoredVault?: VaultDocument;
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

export function evaluateUpdate(candidate: UpdateCandidate, now: string, backup?: VerifiedBackup, migrationApproved: boolean | MigrationApproval = false, backupMaxAgeMs = 24 * 60 * 60 * 1000, currentClientEpoch?: number): UpdateEvaluation {
  assertUpdateCandidate(candidate);
  const schemaChange = candidate.kind === "CANONICAL_SCHEMA";
  const backupState = schemaChange ? classifyBackup(backup, now, backupMaxAgeMs) : "NOT_REQUIRED";
  const backupRequired = schemaChange && backupState !== "CURRENT";
  const affectedRecordClasses = [...new Set(candidate.migrations.flatMap((migration) => migration.affectedRecordClasses))].sort();
  if (!schemaChange) return { decision: "APPLY_SILENTLY", backupState, backupRequired: false, migrationApproved: false, affectedRecordClasses, migrationIds: candidate.migrations.map((migration) => migration.id), rollbackPath: candidate.rollbackPath, reason: "Shell-only update has no canonical schema migration and may apply silently." };
  const approvalIsCurrent = typeof migrationApproved !== "boolean" && isMigrationApprovalForCandidate(candidate, migrationApproved, backup?.digest, now, currentClientEpoch);
  if (!approvalIsCurrent || backupRequired) {
    const backupMessage = backupState === "CURRENT" ? "a verified recent backup is available" : backupState === "MISSING" ? "no verified backup is available" : "the verified backup is stale";
    const approvalMessage = typeof migrationApproved === "boolean" ? "approval is not bound to this candidate and backup" : "approval is stale or does not match this candidate, backup, or client epoch";
    return { decision: "REQUIRE_APPROVAL", backupState, backupRequired, migrationApproved: false, affectedRecordClasses, migrationIds: candidate.migrations.map((migration) => migration.id), rollbackPath: candidate.rollbackPath, reason: `Canonical schema migration requires explicit approval; ${approvalMessage}; ${backupMessage}. Affected record classes: ${affectedRecordClasses.join(", ") || "none"}. Rollback: ${candidate.rollbackPath}` };
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

export function makeMigrationApproval(candidate: UpdateCandidate, sourceFingerprint: string, backupFingerprint: string, clientEpoch: number, approvedAt: string): MigrationApproval {
  assertUpdateCandidate(candidate);
  if (candidate.kind !== "CANONICAL_SCHEMA") throw new Error("Only a canonical schema update can be approved");
  const approval: MigrationApproval = {
    schemaVersion: MIGRATION_JOURNAL_SCHEMA_VERSION,
    releaseId: candidate.releaseId,
    sourceRevision: candidate.sourceRevision,
    artifactDigest: candidate.artifactDigest,
    currentSchemaVersion: candidate.currentSchemaVersion,
    targetSchemaVersion: candidate.targetSchemaVersion,
    migrationIds: candidate.migrations.map((migration) => migration.id),
    sourceFingerprint,
    backupFingerprint,
    clientEpoch,
    approvedAt
  };
  assertMigrationApproval(approval);
  return approval;
}

export async function prepareMigrationJournal(candidate: UpdateCandidate, sourceVault: unknown, backup: VerifiedBackup, approval: MigrationApproval, now: string): Promise<MigrationJournal> {
  assertUpdateCandidate(candidate);
  assertVaultDocument(sourceVault);
  if (candidate.kind !== "CANONICAL_SCHEMA") throw new Error("Only a canonical schema update can be journaled");
  const sourceFingerprint = await fingerprintVault(sourceVault);
  if (!isVerifiedBackupForVault(backup, sourceVault, sourceFingerprint)) throw new Error("Migration backup is missing, stale, or does not match canonical data");
  assertMigrationApproval(approval);
  if (!isMigrationApprovalForCandidate(candidate, approval, backup.digest, now) || approval.sourceFingerprint !== sourceFingerprint) throw new Error("Migration approval is stale or does not match canonical data");
  const journal: MigrationJournal = {
    kind: "SCHEMA_MIGRATION_JOURNAL",
    schemaVersion: MIGRATION_JOURNAL_SCHEMA_VERSION,
    journalId: `${candidate.releaseId}:${sourceFingerprint}`,
    releaseId: candidate.releaseId,
    shellVersion: candidate.shellVersion,
    sourceRevision: candidate.sourceRevision,
    artifactDigest: candidate.artifactDigest,
    currentSchemaVersion: candidate.currentSchemaVersion,
    targetSchemaVersion: candidate.targetSchemaVersion,
    migrationIds: candidate.migrations.map((migration) => migration.id),
    sourceFingerprint,
    backupFingerprint: backup.digest.toLowerCase(),
    backup: structuredClone(sourceVault),
    canonicalFingerprint: sourceFingerprint,
    clientEpoch: approval.clientEpoch,
    state: "PREPARED",
    completedMigrationIds: [],
    startedAt: now,
    updatedAt: now
  };
  assertMigrationJournal(journal, candidate);
  return journal;
}

export async function verifyMigrationJournal(journal: MigrationJournal, candidate?: UpdateCandidate): Promise<void> {
  assertMigrationJournal(journal, candidate);
  await verifyVaultIntegrity(journal.backup);
  const backupFingerprint = await fingerprintVault(journal.backup);
  if (backupFingerprint !== journal.sourceFingerprint || backupFingerprint !== journal.backupFingerprint) throw new Error("Migration journal backup fingerprint mismatch");
}

export async function startMigration(journal: MigrationJournal, candidate: UpdateCandidate, approval: MigrationApproval, currentFingerprint: string, now: string, currentClientEpoch?: number): Promise<MigrationJournal> {
  await verifyMigrationJournal(journal, candidate);
  assertMigrationApproval(approval);
  assertMigrationTransition(journal, candidate, approval, now, currentClientEpoch);
  if (journal.state !== "PREPARED" && journal.state !== "INTERRUPTED") throw new Error("Migration is not resumable");
  if (currentFingerprint !== journal.canonicalFingerprint) throw new Error("Canonical state changed; migration requires repair");
  return { ...structuredClone(journal), state: "RUNNING", updatedAt: now };
}

export async function recordMigrationStep(journal: MigrationJournal, candidate: UpdateCandidate, approval: MigrationApproval, completedMigrationId: string, currentFingerprint: string, resultingFingerprint: string, now: string, currentClientEpoch?: number): Promise<MigrationJournal> {
  await verifyMigrationJournal(journal, candidate);
  assertMigrationApproval(approval);
  assertMigrationTransition(journal, candidate, approval, now, currentClientEpoch);
  if (journal.state !== "RUNNING") throw new Error("Migration is not running");
  if (currentFingerprint !== journal.canonicalFingerprint) throw new Error("Canonical state changed before migration step commit");
  if (!isDigest(resultingFingerprint)) throw new Error("Migration step fingerprint is invalid");
  const expected = journal.migrationIds[journal.completedMigrationIds.length];
  if (completedMigrationId !== expected) throw new Error("Migration steps must commit in declared order");
  const next = { ...structuredClone(journal), completedMigrationIds: [...journal.completedMigrationIds, completedMigrationId], canonicalFingerprint: resultingFingerprint.toLowerCase(), state: journal.completedMigrationIds.length + 1 === journal.migrationIds.length ? "COMPLETED" as const : "RUNNING" as const, updatedAt: now };
  assertMigrationJournal(next, candidate);
  return next;
}

export function interruptMigration(journal: MigrationJournal, candidate: UpdateCandidate, currentFingerprint: string, now: string): MigrationJournal {
  assertMigrationJournal(journal, candidate);
  if (journal.state !== "PREPARED" && journal.state !== "RUNNING") throw new Error("Migration is not interruptible");
  return { ...structuredClone(journal), state: currentFingerprint === journal.canonicalFingerprint ? "INTERRUPTED" : "REPAIR_REQUIRED", updatedAt: now };
}

export async function repairMigration(journal: MigrationJournal, candidate: UpdateCandidate, action: MigrationRepairAction, currentFingerprint: string, now: string, approval?: MigrationApproval, currentClientEpoch?: number): Promise<MigrationRepairResult> {
  await verifyMigrationJournal(journal, candidate);
  if (journal.state !== "INTERRUPTED" && journal.state !== "REPAIR_REQUIRED") throw new Error("Migration does not require repair");
  if (currentFingerprint !== journal.canonicalFingerprint && action === "RESUME") throw new Error("Canonical state changed; migration repair is fenced");
  if (action === "RESUME") {
    if (!approval) throw new Error("Resuming migration requires bound approval");
    assertMigrationApproval(approval);
    assertMigrationTransition(journal, candidate, approval, now, currentClientEpoch);
    if (journal.state === "REPAIR_REQUIRED") throw new Error("Migration requires rollback or explicit reconciliation");
    const resumed = { ...structuredClone(journal), state: "RUNNING" as const, updatedAt: now };
    return { action, journal: resumed };
  }
  const rolledBack = { ...structuredClone(journal), state: "ROLLED_BACK" as const, canonicalFingerprint: journal.sourceFingerprint, completedMigrationIds: [], updatedAt: now };
  return { action, journal: rolledBack, restoredVault: structuredClone(journal.backup) };
}

export function isMigrationApproval(value: unknown): value is MigrationApproval {
  try {
    assertMigrationApproval(value);
    return true;
  } catch {
    return false;
  }
}

export function isMigrationJournal(value: unknown): value is MigrationJournal {
  try {
    assertMigrationJournal(value);
    return true;
  } catch {
    return false;
  }
}

export function makeUpdateLedgerEntry(candidate: UpdateCandidate, recordedAt: string, evaluation: Pick<UpdateEvaluation, "decision">): UpdateLedgerEntry {
  assertUpdateCandidate(candidate);
  return { releaseId: candidate.releaseId, shellVersion: candidate.shellVersion, sourceRevision: candidate.sourceRevision, artifactDigest: candidate.artifactDigest, kind: candidate.kind, recordedAt, decision: evaluation.decision, rollbackPath: candidate.rollbackPath };
}

export function parseUpdateCandidate(value: unknown): UpdateCandidate | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  try {
    assertUpdateCandidate(value as UpdateCandidate);
    return structuredClone(value as UpdateCandidate);
  } catch {
    return undefined;
  }
}

function classifyBackup(backup: VerifiedBackup | undefined, now: string, maxAgeMs: number): BackupState {
  if (!backup) return "MISSING";
  const verifiedAt = Date.parse(backup.verifiedAt);
  const currentAt = Date.parse(now);
  if (!Number.isFinite(verifiedAt) || !Number.isFinite(currentAt) || verifiedAt > currentAt || currentAt - verifiedAt > maxAgeMs || !/^[a-f0-9]{64}$/iu.test(backup.digest) || !Number.isSafeInteger(backup.recordCount) || backup.recordCount < 0 || !Number.isSafeInteger(backup.artifactCount) || backup.artifactCount < 0) return "STALE";
  return "CURRENT";
}

function isVerifiedBackupForVault(backup: VerifiedBackup, vault: VaultDocument, sourceFingerprint: string): boolean {
  return /^[a-f0-9]{64}$/iu.test(backup.digest)
    && backup.digest.toLowerCase() === sourceFingerprint
    && backup.recordCount === vault.records.length
    && backup.artifactCount === (vault.artifacts?.length ?? 0)
    && Number.isSafeInteger(backup.recordCount)
    && Number.isSafeInteger(backup.artifactCount);
}

function isMigrationApprovalForCandidate(candidate: UpdateCandidate, approval: MigrationApproval, backupFingerprint: string | undefined, now: string, currentClientEpoch?: number): boolean {
  return isMigrationApproval(approval)
    && approval.releaseId === candidate.releaseId
    && approval.sourceRevision === candidate.sourceRevision
    && approval.artifactDigest.toLowerCase() === candidate.artifactDigest.toLowerCase()
    && approval.currentSchemaVersion === candidate.currentSchemaVersion
    && approval.targetSchemaVersion === candidate.targetSchemaVersion
    && JSON.stringify(approval.migrationIds) === JSON.stringify(candidate.migrations.map((migration) => migration.id))
    && isDigest(approval.sourceFingerprint)
    && isDigest(approval.backupFingerprint)
    && approval.sourceFingerprint.toLowerCase() === approval.backupFingerprint.toLowerCase()
    && (!backupFingerprint || approval.backupFingerprint.toLowerCase() === backupFingerprint.toLowerCase())
    && (currentClientEpoch === undefined || approval.clientEpoch === currentClientEpoch)
    && approval.approvedAt <= now;
}

function assertMigrationTransition(journal: MigrationJournal, candidate: UpdateCandidate, approval: MigrationApproval, now: string, currentClientEpoch?: number): void {
  if (!isMigrationApprovalForCandidate(candidate, approval, journal.backupFingerprint, now, currentClientEpoch) || approval.sourceFingerprint.toLowerCase() !== journal.sourceFingerprint.toLowerCase() || approval.clientEpoch !== journal.clientEpoch) throw new Error("Migration approval is stale or does not match the journal");
}

function assertMigrationApproval(value: unknown): asserts value is MigrationApproval {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid migration approval");
  const candidate = value as Partial<MigrationApproval>;
  const clientEpoch = candidate.clientEpoch;
  if (candidate.schemaVersion !== MIGRATION_JOURNAL_SCHEMA_VERSION || !isBoundedId(candidate.releaseId, 160) || typeof candidate.sourceRevision !== "string" || !candidate.sourceRevision.trim() || !isDigest(candidate.artifactDigest) || !Number.isSafeInteger(candidate.currentSchemaVersion) || !Number.isSafeInteger(candidate.targetSchemaVersion) || !Array.isArray(candidate.migrationIds) || candidate.migrationIds.length === 0 || candidate.migrationIds.some((id) => !isBoundedId(id, 80)) || !isDigest(candidate.sourceFingerprint) || !isDigest(candidate.backupFingerprint) || typeof clientEpoch !== "number" || !Number.isSafeInteger(clientEpoch) || clientEpoch < 0 || !isIsoDate(candidate.approvedAt)) throw new Error("Invalid migration approval");
}

function assertMigrationJournal(value: unknown, candidate?: UpdateCandidate): asserts value is MigrationJournal {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid migration journal");
  const journal = value as Partial<MigrationJournal>;
  const clientEpoch = journal.clientEpoch;
  if (journal.kind !== "SCHEMA_MIGRATION_JOURNAL" || journal.schemaVersion !== MIGRATION_JOURNAL_SCHEMA_VERSION || !isBoundedId(journal.journalId, 300) || !isBoundedId(journal.releaseId, 160) || typeof journal.shellVersion !== "string" || !journal.shellVersion.trim() || typeof journal.sourceRevision !== "string" || !journal.sourceRevision.trim() || !isDigest(journal.artifactDigest) || !Number.isSafeInteger(journal.currentSchemaVersion) || !Number.isSafeInteger(journal.targetSchemaVersion) || !Array.isArray(journal.migrationIds) || journal.migrationIds.length === 0 || journal.migrationIds.some((id) => !isBoundedId(id, 80)) || !isDigest(journal.sourceFingerprint) || !isDigest(journal.backupFingerprint) || journal.sourceFingerprint.toLowerCase() !== journal.backupFingerprint.toLowerCase() || !isDigest(journal.canonicalFingerprint) || !journal.backup || !Array.isArray(journal.completedMigrationIds) || journal.completedMigrationIds.some((id, index) => id !== journal.migrationIds?.[index]) || journal.completedMigrationIds.length > journal.migrationIds.length || typeof clientEpoch !== "number" || !Number.isSafeInteger(clientEpoch) || clientEpoch < 0 || !isIsoDate(journal.startedAt) || !isIsoDate(journal.updatedAt) || !["PREPARED", "RUNNING", "INTERRUPTED", "REPAIR_REQUIRED", "COMPLETED", "ROLLED_BACK"].includes(String(journal.state)) || (journal.state === "PREPARED" && journal.completedMigrationIds.length !== 0) || (journal.state === "COMPLETED" && journal.completedMigrationIds.length !== journal.migrationIds.length)) throw new Error("Invalid migration journal");
  assertVaultDocument(journal.backup);
  if (candidate) {
    assertUpdateCandidate(candidate);
    if (candidate.releaseId !== journal.releaseId || candidate.shellVersion !== journal.shellVersion || candidate.sourceRevision !== journal.sourceRevision || candidate.artifactDigest.toLowerCase() !== journal.artifactDigest.toLowerCase() || candidate.currentSchemaVersion !== journal.currentSchemaVersion || candidate.targetSchemaVersion !== journal.targetSchemaVersion || JSON.stringify(candidate.migrations.map((migration) => migration.id)) !== JSON.stringify(journal.migrationIds)) throw new Error("Migration journal does not match update candidate");
  }
}

function isDigest(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/iu.test(value);
}

function isBoundedId(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function assertUpdateCandidate(candidate: UpdateCandidate): void {
  if (!/^[a-z][a-z0-9._-]{1,80}$/u.test(candidate.releaseId) || !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/u.test(candidate.shellVersion) || !candidate.sourceRevision.trim() || !/^[a-f0-9]{64}$/iu.test(candidate.artifactDigest) || !["SHELL_ONLY", "CANONICAL_SCHEMA"].includes(candidate.kind) || !Number.isSafeInteger(candidate.currentSchemaVersion) || !Number.isSafeInteger(candidate.targetSchemaVersion) || !candidate.rollbackPath.trim() || !Array.isArray(candidate.migrations)) throw new Error("Invalid update candidate");
  const schemaChange = candidate.kind === "CANONICAL_SCHEMA";
  if (schemaChange !== (candidate.targetSchemaVersion > candidate.currentSchemaVersion) || (schemaChange && candidate.migrations.length === 0) || (!schemaChange && (candidate.migrations.length > 0 || candidate.targetSchemaVersion !== candidate.currentSchemaVersion))) throw new Error("Update candidate schema classification is inconsistent");
  for (const migration of candidate.migrations) {
    if (!/^[a-z][a-z0-9._-]{1,80}$/u.test(migration.id) || !migration.description.trim() || !Array.isArray(migration.affectedRecordClasses) || migration.affectedRecordClasses.some((value) => !value.trim()) || migration.fromSchemaVersion >= migration.toSchemaVersion) throw new Error("Invalid migration plan");
  }
}
