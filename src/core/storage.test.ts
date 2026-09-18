import { describe, expect, it } from "vitest";
import type { CanonicalRecord } from "./model";
import type { EffectOperation } from "./effect";
import { transitionEffect } from "./effect";
import { CanonicalStore, type CanonicalStoreChange } from "./storage";

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
  it("broadcasts metadata-only canonical changes to another open store without exposing record data", async () => {
    const databaseName = `omnevum-test-${Date.now()}-changes`;
    const writer = new CanonicalStore(databaseName);
    const reader = new CanonicalStore(databaseName);
    await writer.open();
    await reader.open();
    const original = record("record-change");
    const received = new Promise<CanonicalStoreChange>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Cross-tab change was not received")), 1_000);
      reader.subscribe((change) => {
        clearTimeout(timeout);
        resolve(change);
      });
    });

    await writer.put(original);
    await expect(received).resolves.toEqual({ kind: "CANONICAL_CHANGED", recordIds: [original.id] });
    await expect(reader.get(original.id)).resolves.toEqual(original);
    writer.close();
    reader.close();
  });

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

  it("previews Vault merge outcomes without mutating canonical state", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-vault-preview`);
    await store.open();
    await store.put(record("record-preview", 2));
    const older = { ...record("record-preview", 1), data: { text: "old" } };
    const preview = await store.previewVault({ format: "OMNEVUM_VAULT", version: 1, exportedAt: new Date().toISOString(), records: [older] });
    expect(preview).toMatchObject({ recordCount: 1, imported: 0, skipped: 1, conflicts: 0, hasPresentation: false });
    expect((await store.get("record-preview"))?.data.text).toBe("hello");
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

  it("commits a canonical write batch atomically when a later revision check fails", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-put-many-atomic`);
    await store.open();
    const original = record("record-put-many-original");
    const candidate = record("record-put-many-candidate");
    await store.put(original);
    await expect(store.putMany([
      { record: candidate },
      { record: { ...original, revision: 2, data: { text: "stale" } }, expectedPreviousRevision: 99 }
    ])).rejects.toThrow("revision conflict");
    expect(await store.get(candidate.id)).toBeUndefined();
    expect(await store.get(original.id)).toEqual(original);
    expect(await store.history(candidate.id)).toEqual([]);
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

  it("applies an allowed-id scope before derived search tokenization", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-scoped-search`);
    await store.open();
    const allowed = record("record-scoped-allowed");
    const denied = { ...record("record-scoped-denied"), data: { text: "shared sentinel" } };
    await store.put({ ...allowed, data: { text: "shared sentinel" } });
    await store.put(denied);

    expect((await store.search("sentinel", new Set([allowed.id]))).map((item) => item.id)).toEqual([allowed.id]);
    expect(await store.search("sentinel", new Set())).toEqual([]);
    store.close();
  });

  it("detects malformed derived search state and rebuilds it without changing canonical data", async () => {
    const databaseName = `omnevum-test-${Date.now()}-search-corruption`;
    const store = new CanonicalStore(databaseName);
    await store.open();
    const original = record("record-search-corruption");
    await store.put(original);
    await store.search("hello");

    const request = indexedDB.open(databaseName, 6);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    });
    const transaction = database.transaction(["searchDocuments", "searchMeta"], "readwrite");
    transaction.objectStore("searchDocuments").put({ id: original.id, terms: 42, modifiedAt: original.modifiedAt });
    transaction.objectStore("searchMeta").put({ id: "default", version: 2, valid: true });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB corruption injection failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB corruption injection aborted"));
    });
    database.close();

    expect(await store.getSearchHealth()).toMatchObject({ valid: false, invalidReason: "MALFORMED" });
    expect(await store.search("hello")).toEqual([original]);
    expect(await store.getSearchHealth()).toMatchObject({ valid: true });
    expect(await store.get(original.id)).toEqual(original);
    store.close();
  });

  it("exports a read-only recovery snapshot when canonical state is malformed", async () => {
    const databaseName = `omnevum-test-${Date.now()}-recovery-snapshot`;
    const store = new CanonicalStore(databaseName);
    await store.open();
    const original = record("record-recovery-snapshot");
    await store.put(original);

    const request = indexedDB.open(databaseName, 6);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    });
    const transaction = database.transaction("records", "readwrite");
    transaction.objectStore("records").put({ id: "broken-record", recordType: "note" });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB corruption injection failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB corruption injection aborted"));
    });
    database.close();

    await expect(store.exportVault()).rejects.toThrow("Invalid canonical record");
    const retainedState = await store.exportRetainedState();
    if (retainedState.format !== "OMNEVUM_RECOVERY_SNAPSHOT") throw new Error("Expected a recovery snapshot");
    expect(retainedState.summary).toEqual({ recordCount: 2, validRecordCount: 1, invalidRecordCount: 1, historyCount: 1, validHistoryCount: 1, invalidHistoryCount: 0, artifactPayloadCount: 0, skippedArtifactPayloadCount: 0 });
    expect(retainedState.records).toEqual(expect.arrayContaining([original, { id: "broken-record", recordType: "note" }]));
    expect(await store.get(original.id)).toEqual(original);
    store.close();
  });

  it("repairs malformed canonical state from a retained snapshot without losing valid records", async () => {
    const databaseName = `omnevum-test-${Date.now()}-recovery-repair`;
    const store = new CanonicalStore(databaseName);
    await store.open();
    const original = record("record-recovery-repair");
    await store.put(original);
    const packageState = { packageId: "preview.constellation", schemaVersion: 1, state: { schemaVersion: 1, seed: 42, tick: 3, paused: false, payload: { position: 2, stars: 1 } } };
    await store.setPackageState(packageState);

    const request = indexedDB.open(databaseName, 6);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    });
    const transaction = database.transaction("records", "readwrite");
    transaction.objectStore("records").put({ id: "broken-repair-record", recordType: "note" });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB corruption injection failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB corruption injection aborted"));
    });
    database.close();

    const retainedState = await store.exportRetainedState();
    if (retainedState.format !== "OMNEVUM_RECOVERY_SNAPSHOT") throw new Error("Expected a recovery snapshot");
    await expect(store.repairFromRecoverySnapshot({ ...retainedState, records: [{ invalid: true }] })).rejects.toThrow("no valid canonical records");
    await expect(store.repairFromRecoverySnapshot({ ...retainedState, records: [...retainedState.records, { invalid: true }] })).resolves.toMatchObject({ retainedRecords: 1, removedRecords: 2, retainedPackageStates: 1, skippedPackageStates: 0 });
    expect(await store.list()).toEqual([original]);
    expect(await store.getPackageState(packageState.packageId)).toEqual(packageState);
    await expect(store.exportVault()).resolves.toMatchObject({ records: [original] });
    store.close();
  });

  it("fences a stale client after another client upgrades the database", async () => {
    const databaseName = `omnevum-test-${Date.now()}-versionchange`;
    const store = new CanonicalStore(databaseName);
    await store.open();
    await store.put(record("record-versionchange"));

    const request = indexedDB.open(databaseName, 7);
    const newerDatabase = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("upgrade-marker")) request.result.createObjectStore("upgrade-marker");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB upgrade failed"));
    });
    newerDatabase.close();

    await expect(store.get("record-versionchange")).rejects.toThrow("Store is not open");
    store.close();
  });

  it("preserves canonical data when an IndexedDB migration transaction is interrupted", async () => {
    const databaseName = `omnevum-test-${Date.now()}-interrupted-migration`;
    const store = new CanonicalStore(databaseName);
    await store.open();
    const original = record("record-interrupted-migration");
    await store.put(original);
    store.close();

    const upgrade = indexedDB.open(databaseName, 7);
    await new Promise<void>((resolve, reject) => {
      upgrade.onupgradeneeded = () => {
        upgrade.result.createObjectStore("interrupted-migration-marker");
        upgrade.transaction?.abort();
      };
      upgrade.onsuccess = () => {
        upgrade.result.close();
        reject(new Error("Interrupted migration unexpectedly completed"));
      };
      upgrade.onerror = () => resolve();
    });

    const recovered = new CanonicalStore(databaseName);
    await recovered.open();
    expect(await recovered.get(original.id)).toEqual(original);
    recovered.close();
  });

  it("reclaims only derived state under injected quota pressure and exposes persistence state", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-quota-pressure`, {
      estimateStorage: async () => ({ usageBytes: 90, quotaBytes: 100 }),
      requestPersistentStorage: async () => true
    });
    await store.open();
    const original = record("record-quota-pressure");
    await store.put(original);
    await store.search("hello");
    expect((await store.getSearchHealth()).valid).toBe(true);

    const health = await store.health();
    expect(health.storage).toMatchObject({ pressure: "ELEVATED", persistence: "GRANTED", reclaimedDerivedState: true });
    expect(await store.get(original.id)).toEqual(original);
    expect(await store.getSearchHealth()).toMatchObject({ valid: false, invalidReason: "PRESSURE_RECLAIM" });
    store.close();
  });

  it("can retry persistent storage from an explicit recovery action", async () => {
    let requests = 0;
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-persistence-retry`, {
      estimateStorage: async () => ({ usageBytes: 10, quotaBytes: 100 }),
      requestPersistentStorage: async () => {
        requests += 1;
        return requests > 1;
      }
    });
    await store.open();
    expect((await store.health()).storage?.persistence).toBe("DENIED");
    await expect(store.requestPersistence()).resolves.toBe("GRANTED");
    expect((await store.health()).storage?.persistence).toBe("GRANTED");
    expect(requests).toBe(2);
    store.close();
  });

  it("keeps canonical records on the IndexedDB fallback when optional persistence APIs are unavailable", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-indexeddb-fallback`, {
      estimateStorage: async () => undefined,
      requestPersistentStorage: async () => undefined
    });
    await store.open();
    const original = record("record-indexeddb-fallback");
    await store.put(original);
    expect(await store.get(original.id)).toEqual(original);
    expect((await store.health()).storage).toBeUndefined();
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

  it("round-trips package state through Vault Recovery", async () => {
    const source = new CanonicalStore(`omnevum-test-${Date.now()}-package-state-source`);
    const destination = new CanonicalStore(`omnevum-test-${Date.now()}-package-state-destination`);
    await source.open();
    await destination.open();
    const state = { packageId: "preview.constellation", schemaVersion: 1, state: { schemaVersion: 1, seed: 42, tick: 3, paused: false, payload: { position: 2, stars: 1 } } };
    await source.setPackageState(state);
    const vault = await source.exportVault();
    expect(vault.packageStates).toEqual([state]);
    expect((await source.previewVault(vault)).packageStates).toBe(1);
    await destination.importVault(vault);
    expect(await destination.getPackageState(state.packageId)).toEqual(state);
    expect(await destination.listPackageStates()).toEqual([state]);
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

  it("exports category-level diagnostics without canonical content", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-diagnostics`);
    await store.open();
    await store.put(record("record-diagnostics"));
    const diagnostics = await store.exportDiagnostics({
      release: { status: "IDENTIFIED", version: "test", sourceRevision: "fixture" },
      serviceWorker: { status: "AVAILABLE", controlled: true, activeState: "activated", updateWaiting: false },
      packageIntegrity: { status: "VERIFIED", artifactDigest: "digest" }
    });
    expect(diagnostics).toMatchObject({
      format: "OMNEVUM_DIAGNOSTICS",
      release: { status: "IDENTIFIED", version: "test" },
      storage: { databaseVersion: 6, recordSchemaVersion: 1, vaultFormatVersion: 1 },
      backup: { vaultExportable: true, offOriginStatus: "UNKNOWN" },
      serviceWorker: { status: "AVAILABLE", controlled: true },
      packageIntegrity: { status: "VERIFIED" },
      connectors: { status: "NONE_ADMITTED" },
      sync: { status: "CONTRACT_ONLY" }
    });
    expect(JSON.stringify(diagnostics)).not.toContain("record-diagnostics");
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
    await store.setPackageState({ packageId: "preview.constellation", schemaVersion: 1, state: { tick: 3 } });
    const original = record("record-clear");
    await store.put(original);
      await store.enqueueEffect({ operationId: "effect-clear", owner: "platform.test", originatingCommand: "test.command", purpose: "test", destination: "test://destination", payloadOrReference: { value: "safe" }, idempotencyKey: "effect-clear-idempotency", createdAt: new Date().toISOString(), status: "PENDING", retryCount: 0, retryPolicy: { maxAttempts: 3, backoffSeconds: 1 }, evidence: [] });
    await store.clear();
    expect(await store.list(true)).toEqual([]);
    expect(await store.history()).toEqual([]);
    expect(await store.listEffects()).toEqual([]);
    expect(await store.getSetting("presentation")).toEqual({ productName: "JohnOS" });
    expect(await store.listPackageStates()).toEqual([]);
    store.close();
  });
});
