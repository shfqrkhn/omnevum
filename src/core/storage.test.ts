import { describe, expect, it } from "vitest";
import type { CanonicalRecord } from "./model";
import { CanonicalStore } from "./storage";

function record(id: string, revision = 1): CanonicalRecord {
  const now = new Date().toISOString();
  return {
    id,
    recordType: "note",
    owner: "core.capture",
    schemaVersion: 1,
    createdAt: now,
    modifiedAt: now,
    provenance: { source: "USER_INPUT", capturedAt: now },
    truthClass: "USER_OBSERVATION",
    sensitivity: "PRIVATE",
    revision,
    deleted: false,
    data: { text: "hello" }
  };
}

describe("CanonicalStore", () => {
  it("persists records and hides tombstones from the visible list", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-visible`);
    await store.open();
    const original = record("record-1");
    await store.put(original);
    expect(await store.get(original.id)).toEqual(original);
    expect(await store.list()).toHaveLength(1);

    await store.put({ ...original, deleted: true, revision: 2 });
    expect(await store.list()).toHaveLength(0);
    expect(await store.list(true)).toHaveLength(1);
    store.close();
  });

  it("round-trips a portable Vault while preserving identity and provenance", async () => {
    const source = new CanonicalStore(`omnevum-test-${Date.now()}-source`);
    const destination = new CanonicalStore(`omnevum-test-${Date.now()}-destination`);
    await source.open();
    await destination.open();
    const original = record("record-2");
    await source.put(original);

    const result = await destination.importVault(await source.exportVault());
    expect(result).toEqual({ imported: 1, skipped: 0 });
    expect(await destination.get(original.id)).toEqual(original);
    expect((await destination.exportVault()).records[0]?.provenance).toEqual(original.provenance);
    source.close();
    destination.close();
  });

  it("does not replace a newer local revision with an older import", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-revision`);
    await store.open();
    await store.put(record("record-3", 2));
    const older = { ...record("record-3", 1), data: { text: "old" } };
    const result = await store.importVault({ format: "OMNEVUM_VAULT", version: 1, exportedAt: new Date().toISOString(), records: [older] });
    expect(result).toEqual({ imported: 0, skipped: 1 });
    expect((await store.get("record-3"))?.data.text).toBe("hello");
    store.close();
  });

  it("rebuilds a derived search index after invalidation without changing canonical data", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-search`);
    await store.open();
    const first = record("record-4");
    const second = { ...record("record-5"), data: { text: "different" } };
    await store.put(first);
    await store.put(second);
    expect((await store.getSearchHealth()).valid).toBe(false);
    expect((await store.search("hello")).map((item) => item.id)).toEqual(["record-4"]);
    expect((await store.getSearchHealth()).valid).toBe(true);

    await store.invalidateSearchIndex();
    expect((await store.getSearchHealth()).valid).toBe(false);
    expect((await store.search("different")).map((item) => item.id)).toEqual(["record-5"]);
    expect(await store.get("record-4")).toEqual(first);
    store.close();
  });

  it("retains revision history and restores an earlier revision through the command owner", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-history`);
    await store.open();
    const original = record("record-6");
    await store.put(original);
    await store.put({ ...original, data: { text: "new" }, revision: 2 });
    expect((await store.history(original.id)).map((entry) => entry.revision)).toEqual([1, 2]);
    store.close();
  });

  it("persists presentation settings separately from canonical records", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-settings`);
    await store.open();
    await store.setSetting("presentation", { productName: "JohnOS", theme: "dark" });
    expect(await store.getSetting<{ productName: string }>("presentation")).toEqual({ productName: "JohnOS", theme: "dark" });
    expect(await store.list()).toEqual([]);
    store.close();
  });
});
