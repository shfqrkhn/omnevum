import { describe, expect, it } from "vitest";
import { evaluateShellActivation, evaluateUpdate, interruptedMigration, makeUpdateLedgerEntry, migrateRecord, migrateVault, parseUpdateCandidate, type UpdateCandidate, type VerifiedBackup } from "./migration";
import type { CanonicalRecord } from "./model";

function record(): CanonicalRecord {
  const now = new Date().toISOString();
  return { id: "migrate", recordType: "note", owner: "core.capture", schemaVersion: 1, createdAt: now, modifiedAt: now, provenance: { source: "USER_INPUT", capturedAt: now }, truthClass: "USER_OBSERVATION", sensitivity: "PRIVATE", revision: 1, deleted: false, data: { text: "safe" } };
}

describe("versioned migration seam", () => {
  it("rehearses current records and Vaults without mutation", () => {
    const input = record();
    const migrated = migrateRecord(input);
    expect(migrated.receipt.changed).toBe(false);
    expect(migrated.record).toEqual(input);
    const vault = migrateVault({ format: "OMNEVUM_VAULT", version: 1, exportedAt: new Date().toISOString(), records: [input] });
    expect(vault.vault.records[0]).toEqual(input);
  });

  it("fails closed for a future target", () => {
    expect(() => migrateRecord(record(), 2)).toThrow("newer");
  });

  it("applies a shell-only candidate silently and records its rollback path", () => {
    const candidate: UpdateCandidate = {
      releaseId: "shell-2",
      shellVersion: "0.2.0",
      sourceRevision: "shell-revision",
      artifactDigest: "a".repeat(64),
      kind: "SHELL_ONLY",
      currentSchemaVersion: 1,
      targetSchemaVersion: 1,
      migrations: [],
      rollbackPath: "retain-cache-shell-1",
      readCompatible: true
    };
    const evaluation = evaluateUpdate(candidate, "2026-09-19T12:00:00.000Z");
    expect(evaluation).toMatchObject({ decision: "APPLY_SILENTLY", backupState: "NOT_REQUIRED", backupRequired: false });
    expect(makeUpdateLedgerEntry(candidate, "2026-09-19T12:01:00.000Z", evaluation)).toMatchObject({ releaseId: "shell-2", decision: "APPLY_SILENTLY", rollbackPath: "retain-cache-shell-1" });
    expect(evaluateShellActivation(candidate, false)).toMatchObject({ decision: "ACTIVATE", usable: true });
  });

  it("requires explicit approval and a current verified backup for canonical migration", () => {
    const candidate: UpdateCandidate = {
      releaseId: "schema-2",
      shellVersion: "0.3.0",
      sourceRevision: "schema-revision",
      artifactDigest: "b".repeat(64),
      kind: "CANONICAL_SCHEMA",
      currentSchemaVersion: 1,
      targetSchemaVersion: 2,
      migrations: [{ id: "records-v2", description: "Add typed record metadata", affectedRecordClasses: ["note", "artifact"], fromSchemaVersion: 1, toSchemaVersion: 2 }],
      rollbackPath: "restore-vault-before-records-v2",
      readCompatible: false
    };
    const withoutBackup = evaluateUpdate(candidate, "2026-09-19T12:00:00.000Z");
    expect(withoutBackup).toMatchObject({ decision: "REQUIRE_APPROVAL", backupState: "MISSING", backupRequired: true, migrationApproved: false, affectedRecordClasses: ["artifact", "note"] });
    expect(withoutBackup.reason).toMatch(/records-v2|restore-vault/iu);
    const backup: VerifiedBackup = { verifiedAt: "2026-09-19T11:30:00.000Z", digest: "c".repeat(64), recordCount: 12, artifactCount: 2 };
    const approved = evaluateUpdate(candidate, "2026-09-19T12:00:00.000Z", backup, true);
    expect(approved).toMatchObject({ decision: "APPLY_AFTER_APPROVAL", backupState: "CURRENT", backupRequired: false, migrationApproved: true });
    expect(evaluateShellActivation(candidate, false)).toMatchObject({ decision: "REFUSE_CONTROL", usable: true });
    expect(interruptedMigration(candidate)).toMatchObject({ canonicalData: "RETAIN_CURRENT_SCHEMA", shell: "CURRENT_SHELL", rollbackPath: candidate.rollbackPath });
  });

  it("rejects stale or malformed backup receipts instead of treating them as verified", () => {
    const candidate: UpdateCandidate = {
      releaseId: "schema-2",
      shellVersion: "0.3.0",
      sourceRevision: "schema-revision",
      artifactDigest: "d".repeat(64),
      kind: "CANONICAL_SCHEMA",
      currentSchemaVersion: 1,
      targetSchemaVersion: 2,
      migrations: [{ id: "records-v2", description: "Add typed record metadata", affectedRecordClasses: ["note"], fromSchemaVersion: 1, toSchemaVersion: 2 }],
      rollbackPath: "restore-vault-before-records-v2",
      readCompatible: true
    };
    const stale: VerifiedBackup = { verifiedAt: "2026-09-17T12:00:00.000Z", digest: "not-a-digest", recordCount: 1, artifactCount: 0 };
    expect(evaluateUpdate(candidate, "2026-09-19T12:00:00.000Z", stale, true)).toMatchObject({ decision: "REQUIRE_APPROVAL", backupState: "STALE", backupRequired: true });
    expect(evaluateShellActivation(candidate, false)).toMatchObject({ decision: "READ_COMPATIBLE", usable: true });
  });

  it("parses only structurally valid update candidates from an untrusted runtime message", () => {
    const candidate: UpdateCandidate = {
      releaseId: "schema-2",
      shellVersion: "0.3.0",
      sourceRevision: "schema-revision",
      artifactDigest: "e".repeat(64),
      kind: "CANONICAL_SCHEMA",
      currentSchemaVersion: 1,
      targetSchemaVersion: 2,
      migrations: [{ id: "records-v2", description: "Add typed record metadata", affectedRecordClasses: ["note"], fromSchemaVersion: 1, toSchemaVersion: 2 }],
      rollbackPath: "restore-vault-before-records-v2",
      readCompatible: false
    };
    const parsed = parseUpdateCandidate(candidate);
    expect(parsed).toEqual(candidate);
    expect(parsed).not.toBe(candidate);
    expect(parseUpdateCandidate({ ...candidate, artifactDigest: "not-a-digest" })).toBeUndefined();
    expect(parseUpdateCandidate({ kind: "CANONICAL_SCHEMA" })).toBeUndefined();
  });
});
