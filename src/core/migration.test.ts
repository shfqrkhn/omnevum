import { describe, expect, it } from "vitest";
import { migrateRecord, migrateVault } from "./migration";
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
});
