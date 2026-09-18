import { describe, expect, it } from "vitest";
import { isCanonicalRecord, isVaultDocument, isVaultPackageAutomation, isVaultPackageState } from "./validation";
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

  it("bounds package state identity and payloads", () => {
    const valid = { packageId: "preview.constellation", schemaVersion: 1, state: { tick: 3, payload: { stars: 1 } } };
    expect(isVaultPackageState(valid)).toBe(true);
    expect(isVaultPackageState({ ...valid, packageId: "Bad Package" })).toBe(false);
    expect(isVaultDocument({ format: "OMNEVUM_VAULT", version: 1, exportedAt: new Date().toISOString(), records: [], packageStates: [valid, valid], artifacts: [] })).toBe(false);
  });

  it("validates bounded package automation documents and Vault uniqueness", () => {
    const document = JSON.stringify({
      schemaVersion: 1,
      ruleId: "sample.automation.review",
      version: 1,
      trigger: "ON_CAPTURE",
      when: { op: "exists", path: "record.kind" },
      actions: [{ command: "record.update", arguments: { field: "priority", value: 3 } }],
      enabled: true
    });
    const valid = {
      schemaVersion: 1,
      packageId: "sample.automation",
      ruleId: "sample.automation.review",
      ruleVersion: 1,
      document,
      status: "DISABLED" as const,
      installedAt: new Date().toISOString(),
      disabledReason: "owner paused this rule"
    };
    expect(isVaultPackageAutomation(valid)).toBe(true);
    expect(isVaultPackageAutomation({ ...valid, document: document.replace('"version":1', '"version":2') })).toBe(false);
    expect(isVaultDocument({ format: "OMNEVUM_VAULT", version: 1, exportedAt: new Date().toISOString(), records: [], automationRules: [valid, valid], artifacts: [] })).toBe(false);
  });
});
