import { describe, expect, it } from "vitest";
import { CLIENT_FENCE_SETTING, MAX_MIGRATION_LEDGER_ENTRIES, MAX_UPDATE_LEDGER_ENTRIES, advanceClientFence, appendMigrationJournal, appendShellUpdateObservation, assertClientCanWrite, evaluateClientFence, issueClientLease, isShellUpdateLedgerEntry, makeClientFenceState, parseMigrationLedger, parseShellUpdateLedger, type ShellUpdateLedgerEntry } from "./update-ledger";
import { makeMigrationApproval, prepareMigrationJournal, type UpdateCandidate } from "./migration";
import { fingerprintVault, withVaultIntegrity } from "./vault";
import type { CanonicalRecord } from "./model";

const observation = (releaseId: string, decision: "ACTIVATED" | "WAITING" | "ROLLED_BACK" = "ACTIVATED") => ({
  releaseId,
  shellVersion: releaseId,
  cacheName: releaseId,
  observedAt: "2026-09-19T12:00:00.000Z",
  decision,
  rollbackPath: "retain the previous service-worker cache generation and export a Vault before canonical migration"
});

describe("service-worker update ledger", () => {
  it("fails closed for malformed or secret-shaped persisted entries", () => {
    expect(parseShellUpdateLedger([{ schemaVersion: 1, releaseId: "omnevum-shell-good", shellVersion: "omnevum-shell-good", cacheName: "omnevum-shell-good", observedAt: "2026-09-19T12:00:00.000Z", decision: "ACTIVATED", rollbackPath: "retain previous" }, { cacheName: "omnevum-shell-bad" }, { schemaVersion: 1, releaseId: "omnevum-shell-secret", shellVersion: "omnevum-shell-secret", cacheName: "omnevum-shell-secret", observedAt: "2026-09-19T12:00:00.000Z", decision: "ACTIVATED", rollbackPath: "Bearer token=do-not-store" }])).toHaveLength(2);
    expect(isShellUpdateLedgerEntry({ ...observation("omnevum-shell-a"), schemaVersion: 1 })).toBe(true);
  });

  it("deduplicates a release decision, bounds history, and keeps the newest first", () => {
    let ledger: ShellUpdateLedgerEntry[] = [];
    for (let index = 0; index < MAX_UPDATE_LEDGER_ENTRIES + 2; index += 1) {
      const releaseId = `omnevum-shell-${index.toString(16)}`;
      ledger = appendShellUpdateObservation(ledger, observation(releaseId));
    }
    expect(ledger).toHaveLength(MAX_UPDATE_LEDGER_ENTRIES);
    expect(ledger[0]?.releaseId).toBe(`omnevum-shell-${(MAX_UPDATE_LEDGER_ENTRIES + 1).toString(16)}`);
    const replaced = appendShellUpdateObservation(ledger, { ...observation("omnevum-shell-a"), observedAt: "2026-09-19T13:00:00.000Z" });
    expect(replaced.filter((entry) => entry.releaseId === "omnevum-shell-a" && entry.decision === "ACTIVATED")).toHaveLength(1);
    expect(replaced.find((entry) => entry.releaseId === "omnevum-shell-a")?.observedAt).toBe("2026-09-19T13:00:00.000Z");
  });

  it("persists bounded migration journal transitions and rejects malformed journals", async () => {
    const now = "2026-09-19T12:00:00.000Z";
    const sourceRecord: CanonicalRecord = { id: "journal-record", recordType: "note", owner: "core.capture", schemaVersion: 1, createdAt: now, modifiedAt: now, provenance: { source: "USER_INPUT", capturedAt: now }, truthClass: "USER_OBSERVATION", sensitivity: "PRIVATE", revision: 1, deleted: false, data: { text: "preserve" } };
    const source = await withVaultIntegrity({ format: "OMNEVUM_VAULT", version: 1, exportedAt: now, records: [sourceRecord] });
    const fingerprint = await fingerprintVault(source);
    const candidate: UpdateCandidate = { releaseId: "schema-2", shellVersion: "0.3.0", sourceRevision: "schema-revision", artifactDigest: "c".repeat(64), kind: "CANONICAL_SCHEMA", currentSchemaVersion: 1, targetSchemaVersion: 2, migrations: [{ id: "records-v2", description: "Add metadata", affectedRecordClasses: ["note"], fromSchemaVersion: 1, toSchemaVersion: 2 }], rollbackPath: "restore-backup", readCompatible: false };
    const approval = makeMigrationApproval(candidate, fingerprint, fingerprint, 2, "2026-09-19T11:55:00.000Z");
    const journal = await prepareMigrationJournal(candidate, source, { verifiedAt: "2026-09-19T11:30:00.000Z", digest: fingerprint, recordCount: 1, artifactCount: 0 }, approval, now);
    let ledger = appendMigrationJournal([], journal);
    expect(parseMigrationLedger(ledger)).toEqual([journal]);
    for (let index = 0; index < MAX_MIGRATION_LEDGER_ENTRIES + 2; index += 1) ledger = appendMigrationJournal(ledger, { ...journal, journalId: `${journal.journalId}:${index}`, updatedAt: `2026-09-19T12:${String(index).padStart(2, "0")}:00.000Z` });
    expect(ledger).toHaveLength(MAX_MIGRATION_LEDGER_ENTRIES);
    expect(parseMigrationLedger([{ ...journal, backupFingerprint: "not-a-digest" }, { ...journal, state: "not-a-state" }])).toEqual([]);
    expect(CLIENT_FENCE_SETTING).toBe("updates.clientFence");
  });

  it("monotonically fences stale client leases after a canonical transition", () => {
    const initial = makeClientFenceState("a".repeat(64), "2026-09-19T12:00:00.000Z");
    const lease = issueClientLease(initial, "client-a", "2026-09-19T12:01:00.000Z");
    expect(evaluateClientFence(initial, lease)).toMatchObject({ decision: "ALLOW_WRITE", stale: false });
    const next = advanceClientFence(initial, "b".repeat(64), "2026-09-19T12:02:00.000Z");
    expect(next.epoch).toBe(1);
    expect(evaluateClientFence(next, lease)).toMatchObject({ decision: "RELOAD_REQUIRED", stale: true });
    expect(() => assertClientCanWrite(next, lease)).toThrow(/stale|reload/iu);
    const refreshed = issueClientLease(next, "client-a", "2026-09-19T12:03:00.000Z");
    expect(evaluateClientFence(next, refreshed)).toMatchObject({ decision: "ALLOW_WRITE", stale: false });
    expect(evaluateClientFence(next, { ...refreshed, canonicalFingerprint: "c".repeat(64) })).toMatchObject({ decision: "READ_ONLY", stale: true });
  });
});
