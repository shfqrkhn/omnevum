import { describe, expect, it } from "vitest";
import type { CanonicalRecord } from "./model";
import { mergeReplicaRecords, SyncEngine, type SyncTransport } from "./sync";
import { CanonicalStore } from "./storage";

function record(id: string, revision: number, deleted = false, text = "same"): CanonicalRecord {
  const now = new Date().toISOString();
  return { id, recordType: "note", owner: "core.capture", schemaVersion: 1, createdAt: now, modifiedAt: now, provenance: { source: "USER_INPUT", capturedAt: now }, truthClass: "USER_OBSERVATION", sensitivity: "PRIVATE", revision, deleted, data: { text } };
}

describe("provider-neutral replica merge", () => {
  it("preserves a local tombstone against a stale remote active record", () => {
    const result = mergeReplicaRecords([record("gone", 2, true)], [record("gone", 1)]);
    expect(result.records[0]).toMatchObject({ id: "gone", deleted: true, revision: 2 });
    expect(result.tombstonesPreserved).toBe(1);
    expect(result.conflicts[0]?.reason).toBe("TOMBSTONE_RESURRECTION");
  });

  it("surfaces equal-revision semantic divergence instead of choosing a winner", () => {
    const result = mergeReplicaRecords([record("same-rev", 3, false, "local")], [record("same-rev", 3, false, "remote")]);
    expect(result.records[0]?.data.text).toBe("local");
    expect(result.conflicts[0]?.reason).toBe("EQUAL_REVISION_DIFFERENCE");
  });

  it("accepts a causally newer tombstone", () => {
    const result = mergeReplicaRecords([record("delete", 1)], [record("delete", 2, true)]);
    expect(result.records[0]).toMatchObject({ id: "delete", deleted: true, revision: 2 });
    expect(result.conflicts).toHaveLength(0);
  });

  it("accepts only an explicitly marked user restore over a tombstone", () => {
    const restored = record("restore", 3, false, "restored");
    restored.data.restoreIntent = "EXPLICIT_USER_RESTORE";
    const result = mergeReplicaRecords([record("restore", 2, true)], [restored]);
    expect(result.records[0]?.deleted).toBe(false);
    expect(result.conflicts).toHaveLength(0);
  });

  it("runs a provider-neutral pull/merge/push cycle through the canonical store", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-sync-engine`);
    await store.open();
    await store.put(record("local", 1, false, "local"));
    const pushed: CanonicalRecord[][] = [];
    const transport: SyncTransport = { pull: async () => [record("remote", 1, false, "remote")], push: async (records) => { pushed.push(records); } };
    const result = await new SyncEngine(store, transport).synchronize();
    expect(result.imported).toBe(1);
    expect(pushed[0]?.map((item) => item.id)).toEqual(["local", "remote"]);
    expect((await store.list()).map((item) => item.id)).toEqual(["local", "remote"]);
    store.close();
  });
});
