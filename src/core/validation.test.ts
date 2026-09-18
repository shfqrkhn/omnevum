import { describe, expect, it } from "vitest";
import { isCanonicalRecord, isVaultDocument } from "./validation";
import type { CanonicalRecord } from "./model";

function record(overrides: Partial<CanonicalRecord> = {}): CanonicalRecord {
  const now = new Date().toISOString();
  return {
    id: "record-validation",
    recordType: "note",
    owner: "core.capture",
    schemaVersion: 1,
    createdAt: now,
    modifiedAt: now,
    provenance: { source: "USER_INPUT", capturedAt: now },
    truthClass: "USER_OBSERVATION",
    sensitivity: "PRIVATE",
    revision: 1,
    deleted: false,
    data: { text: "safe" },
    ...overrides
  };
}

describe("bounded untrusted record validation", () => {
  it("rejects malformed identity, time, and data shapes", () => {
    expect(isCanonicalRecord(record({ id: "bad/id" }))).toBe(false);
    expect(isCanonicalRecord(record({ createdAt: "not-a-date" }))).toBe(false);
    expect(isCanonicalRecord(record({ data: [] as unknown as Record<string, unknown> }))).toBe(false);
  });

  it("accepts user-facing source references that are not technical IDs", () => {
    expect(isCanonicalRecord(record({ provenance: { source: "IMPORT", capturedAt: new Date().toISOString(), sourceId: "Receipt 2026/09/17.txt" } }))).toBe(true);
  });

  it("rejects duplicate record identities in a Vault", () => {
    const first = record();
    expect(isVaultDocument({ format: "OMNEVUM_VAULT", version: 1, exportedAt: new Date().toISOString(), records: [first, { ...first, modifiedAt: new Date().toISOString() }], artifacts: [] })).toBe(false);
  });
});
