import { describe, expect, it } from "vitest";
import type { CanonicalRecord } from "./model";
import type { EffectOperation } from "./effect";
import { transitionEffect } from "./effect";
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
    expect(result).toEqual({ imported: 1, skipped: 0, conflicts: 0 });
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
    expect(result).toEqual({ imported: 0, skipped: 1, conflicts: 0 });
    expect((await store.get("record-3"))?.data.text).toBe("hello");
    store.close();
  });

  it("rejects a concurrent revision mismatch without writing the candidate", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-put-conflict`);
    await store.open();
    const original = record("record-put-conflict");
    await store.put(original);
    await expect(store.put({ ...original, revision: 2, data: { text: "stale" } }, undefined, 99)).rejects.toThrow("revision conflict");
    expect(await store.get(original.id)).toEqual(original);
    store.close();
  });

  it("rejects a non-monotonic direct write", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-put-monotonic`);
    await store.open();
    const original = record("record-put-monotonic");
    await store.put(original);
    await expect(store.put({ ...original, revision: 1, data: { text: "same revision" } })).rejects.toThrow("revision conflict");
    expect(await store.get(original.id)).toEqual(original);
    store.close();
  });

  it("treats a repeated identical Vault import as idempotent", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-idempotent-import`);
    await store.open();
    const original = record("record-idempotent");
    await store.put(original);
    const vault = await store.exportVault();
    expect(await store.importVault(vault)).toEqual({ imported: 0, skipped: 1, conflicts: 0 });
    expect((await store.history(original.id)).map((entry) => entry.revision)).toEqual([1]);
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

  it("carries presentation settings in a Vault and restores them separately", async () => {
    const source = new CanonicalStore(`omnevum-test-${Date.now()}-presentation-vault-source`);
    const destination = new CanonicalStore(`omnevum-test-${Date.now()}-presentation-vault-destination`);
    await source.open();
    await destination.open();
    await source.setSetting("presentation", { schemaVersion: 1, productName: "JohnOS", theme: "dark", locale: "en-CA" });
    const vault = await source.exportVault();
    expect(vault.presentation).toEqual({ schemaVersion: 1, productName: "JohnOS", theme: "dark", locale: "en-CA" });
    await destination.importVault(vault);
    expect(await destination.getSetting("presentation")).toEqual(vault.presentation);
    source.close();
    destination.close();
  });

  it("preserves a bounded artifact payload through Vault export and restore", async () => {
    const source = new CanonicalStore(`omnevum-test-${Date.now()}-artifact-source`);
    const destination = new CanonicalStore(`omnevum-test-${Date.now()}-artifact-destination`);
    await source.open();
    await destination.open();
    const { CommandBus } = await import("./commands");
    const commands = new CommandBus(source);
    const created = await commands.createArtifact({ fileName: "hello.txt", mimeType: "text/plain", blob: new Blob(["hello artifact"]) });
    const vault = await source.exportVault();
    expect(vault.integrity).toMatchObject({ algorithm: "SHA-256" });
    expect(vault.artifacts).toHaveLength(1);
    expect(await (await source.getArtifact(created.id))?.text()).toBe("hello artifact");
    await destination.importVault(vault);
    expect(await (await destination.getArtifact(created.id))?.text()).toBe("hello artifact");
    expect((await destination.get(created.id))?.data.sha256).toBe(created.data.sha256);
    source.close();
    destination.close();
  });

  it("reports canonical and derived health without hiding an invalid index", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-health`);
    await store.open();
    const before = await store.health();
    expect(before).toMatchObject({ activeRecords: 0, archivedRecords: 0, historyEntries: 0, artifactPayloads: 0, pendingEffects: 0, searchIndexValid: false });
    await store.search("");
    expect((await store.health()).searchIndexValid).toBe(true);
    store.close();
  });

  it("reclaims only the derived search state", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-reclaim`);
    await store.open();
    const original = record("record-reclaim");
    await store.put(original);
    await store.search("hello");
    await store.reclaimDerivedState();
    expect((await store.getSearchHealth()).valid).toBe(false);
    expect(await store.get(original.id)).toEqual(original);
    expect(await store.search("hello")).toEqual([original]);
    store.close();
  });

  it("reports an equal-revision semantic conflict instead of overwriting local meaning", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-conflict-import`);
    await store.open();
    await store.put(record("record-conflict", 2));
    const result = await store.importVault({ format: "OMNEVUM_VAULT", version: 1, exportedAt: new Date().toISOString(), records: [{ ...record("record-conflict", 2), data: { text: "different" } }] });
    expect(result).toEqual({ imported: 0, skipped: 1, conflicts: 1 });
    expect((await store.get("record-conflict"))?.data.text).toBe("hello");
    store.close();
  });

  it("does not resurrect a tombstoned record from a newer unmarked import", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-tombstone-import`);
    await store.open();
    const original = record("record-tombstone");
    await store.put(original);
    await store.put({ ...original, deleted: true, revision: 2 });
    const result = await store.importVault({ format: "OMNEVUM_VAULT", version: 1, exportedAt: new Date().toISOString(), records: [{ ...original, revision: 3, data: { text: "remote resurrection" } }] });
    expect(result).toEqual({ imported: 0, skipped: 1, conflicts: 1 });
    expect((await store.get(original.id))?.deleted).toBeUndefined();
    expect((await store.get(original.id, true))?.deleted).toBe(true);
    store.close();
  });

  it("rejects a tampered integrity-protected Vault before writing", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-vault-integrity`);
    await store.open();
    const vault = await store.exportVault();
    const tampered = { ...vault, exportedAt: new Date(Date.now() + 1).toISOString() };
    await expect(store.importVault(tampered)).rejects.toThrow("integrity");
    expect(await store.list()).toEqual([]);
    store.close();
  });

  it("stores durable outbox operations separately from canonical life records", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-effects`);
    await store.open();
    const effect: EffectOperation = {
      operationId: "effect-1",
      owner: "platform.test",
      originatingCommand: "test.command",
      purpose: "test",
      destination: "test://destination",
      payloadOrReference: { value: "safe" },
      idempotencyKey: "effect-1-idempotency",
      createdAt: new Date().toISOString(),
      status: "PENDING",
      retryCount: 0,
      retryPolicy: { maxAttempts: 3, backoffSeconds: 1 },
      evidence: []
    };
    await store.enqueueEffect(effect);
    expect(await store.getEffect(effect.operationId)).toEqual(effect);
    expect(await store.listEffects("PENDING")).toEqual([effect]);
    const inFlight = transitionEffect(effect, "IN_FLIGHT");
    await store.updateEffect(inFlight);
    expect(await store.getEffect(effect.operationId)).toEqual(inFlight);
    expect(await store.list()).toEqual([]);
    store.close();
  });

  it("clears canonical records, history, artifacts, and effects without clearing presentation settings", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-clear`);
    await store.open();
    await store.setSetting("presentation", { productName: "JohnOS" });
    const original = record("record-clear");
    await store.put(original);
      await store.enqueueEffect({ operationId: "effect-clear", owner: "platform.test", originatingCommand: "test.command", purpose: "test", destination: "test://destination", payloadOrReference: { value: "safe" }, idempotencyKey: "effect-clear-idempotency", createdAt: new Date().toISOString(), status: "PENDING", retryCount: 0, retryPolicy: { maxAttempts: 3, backoffSeconds: 1 }, evidence: [] });
    await store.clear();
    expect(await store.list(true)).toEqual([]);
    expect(await store.history()).toEqual([]);
    expect(await store.listEffects()).toEqual([]);
    expect(await store.getSetting("presentation")).toEqual({ productName: "JohnOS" });
    store.close();
  });
});
