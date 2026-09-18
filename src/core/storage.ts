import type { CanonicalRecord, HistoryEntry, VaultArtifact, VaultDocument } from "./model";
import { MAX_PORTABLE_ARTIFACT_BYTES } from "./artifact";
import { VAULT_FORMAT_VERSION } from "./model";
import { isSearchDocument, makeSearchDocument, SEARCH_INDEX_VERSION, searchDocuments, type SearchDocument, type SearchIndexMeta } from "./search";
import { assertEffectOperation, type EffectOperation } from "./effect";
import { withVaultIntegrity, verifyVaultIntegrity } from "./vault";
import { assertCanonicalRecord, assertVaultDocument, isHistoryEntry } from "./validation";

const RECORD_STORE = "records";
const SEARCH_STORE = "searchDocuments";
const SEARCH_META_STORE = "searchMeta";
const HISTORY_STORE = "history";
const SETTINGS_STORE = "settings";
const ARTIFACT_STORE = "artifactBlobs";
const EFFECT_STORE = "effects";

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export class CanonicalStore {
  private database: IDBDatabase | null = null;

  public constructor(private readonly databaseName = "omnevum-canonical-v1") {}

  public async open(): Promise<void> {
    if (this.database) return;

    const request = indexedDB.open(this.databaseName, 6);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(RECORD_STORE)) {
        database.createObjectStore(RECORD_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(SEARCH_STORE)) {
        database.createObjectStore(SEARCH_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(SEARCH_META_STORE)) {
        database.createObjectStore(SEARCH_META_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(HISTORY_STORE)) {
        database.createObjectStore(HISTORY_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(SETTINGS_STORE)) {
        database.createObjectStore(SETTINGS_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(ARTIFACT_STORE)) {
        database.createObjectStore(ARTIFACT_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(EFFECT_STORE)) {
        database.createObjectStore(EFFECT_STORE, { keyPath: "operationId" });
      }
    };
    this.database = await requestResult(request);
  }

  public close(): void {
    this.database?.close();
    this.database = null;
  }

  public async get(id: string, includeDeleted = false): Promise<CanonicalRecord | undefined> {
    const record = await requestResult(this.requireDatabase().transaction(RECORD_STORE, "readonly").objectStore(RECORD_STORE).get(id));
    if (record) assertCanonicalRecord(record);
    if (!record || (!includeDeleted && record.deleted)) return undefined;
    return record;
  }

  public async list(includeDeleted = false): Promise<CanonicalRecord[]> {
    const records = await requestResult(this.requireDatabase().transaction(RECORD_STORE, "readonly").objectStore(RECORD_STORE).getAll());
    records.forEach(assertCanonicalRecord);
    return includeDeleted ? records : records.filter((record) => !record.deleted);
  }

  public async findByProvenance(sourceId: string): Promise<CanonicalRecord[]> {
    const records = await this.list(true);
    return records.filter((record) => record.provenance.sourceId === sourceId);
  }

  public async put(record: CanonicalRecord, artifactBlob?: Blob, expectedPreviousRevision?: number): Promise<void> {
    assertCanonicalRecord(record);
    const transaction = this.requireDatabase().transaction([RECORD_STORE, SEARCH_META_STORE, HISTORY_STORE, ARTIFACT_STORE], "readwrite");
    const recordStore = transaction.objectStore(RECORD_STORE);
    const currentRequest = recordStore.get(record.id);
    let revisionConflict = false;
    currentRequest.onsuccess = () => {
      const current = currentRequest.result as CanonicalRecord | undefined;
      if ((expectedPreviousRevision !== undefined && (!current || current.revision !== expectedPreviousRevision)) || (expectedPreviousRevision === undefined && current && record.revision <= current.revision)) {
        revisionConflict = true;
        transaction.abort();
        return;
      }
      recordStore.put(record);
      transaction.objectStore(SEARCH_META_STORE).put({ id: "default", version: SEARCH_INDEX_VERSION, valid: false } satisfies SearchIndexMeta);
      transaction.objectStore(HISTORY_STORE).put({ id: `${record.id}:${record.revision}`, recordId: record.id, revision: record.revision, recordedAt: new Date().toISOString(), record } satisfies HistoryEntry);
      if (artifactBlob) transaction.objectStore(ARTIFACT_STORE).put({ id: record.id, blob: artifactBlob });
    };
    try {
      await transactionDone(transaction);
    } catch (error) {
      if (revisionConflict) throw new Error("Canonical revision conflict");
      throw error;
    }
  }

  public async clear(): Promise<void> {
    const transaction = this.requireDatabase().transaction([RECORD_STORE, SEARCH_STORE, SEARCH_META_STORE, HISTORY_STORE, ARTIFACT_STORE, EFFECT_STORE], "readwrite");
    transaction.objectStore(RECORD_STORE).clear();
    transaction.objectStore(SEARCH_STORE).clear();
    transaction.objectStore(SEARCH_META_STORE).put({ id: "default", version: SEARCH_INDEX_VERSION, valid: true, rebuiltAt: new Date().toISOString() } satisfies SearchIndexMeta);
    transaction.objectStore(HISTORY_STORE).clear();
    transaction.objectStore(ARTIFACT_STORE).clear();
    transaction.objectStore(EFFECT_STORE).clear();
    await transactionDone(transaction);
  }

  public async history(recordId?: string): Promise<HistoryEntry[]> {
    const entries = (await requestResult(this.requireDatabase().transaction(HISTORY_STORE, "readonly").objectStore(HISTORY_STORE).getAll())).filter(isHistoryEntry);
    return entries
      .filter((entry) => recordId === undefined || entry.recordId === recordId)
      .sort((left, right) => left.revision - right.revision || left.recordedAt.localeCompare(right.recordedAt));
  }

  public async getSetting<T>(id: string): Promise<T | undefined> {
    const setting = await requestResult(this.requireDatabase().transaction(SETTINGS_STORE, "readonly").objectStore(SETTINGS_STORE).get(id));
    if (!setting || typeof setting !== "object" || setting === null || !("value" in setting)) return undefined;
    return (setting as { value: T }).value;
  }

  public async setSetting<T>(id: string, value: T): Promise<void> {
    const transaction = this.requireDatabase().transaction(SETTINGS_STORE, "readwrite");
    transaction.objectStore(SETTINGS_STORE).put({ id, value, modifiedAt: new Date().toISOString() });
    await transactionDone(transaction);
  }

  public async getArtifact(id: string): Promise<Blob | undefined> {
    const value = await requestResult(this.requireDatabase().transaction(ARTIFACT_STORE, "readonly").objectStore(ARTIFACT_STORE).get(id));
    if (!value || typeof value !== "object" || !("blob" in value) || !(value.blob instanceof Blob)) return undefined;
    return value.blob;
  }

  public async enqueueEffect(operation: EffectOperation): Promise<void> {
    assertEffectOperation(operation);
    const transaction = this.requireDatabase().transaction(EFFECT_STORE, "readwrite");
    transaction.objectStore(EFFECT_STORE).put(operation);
    await transactionDone(transaction);
  }

  public async getEffect(operationId: string): Promise<EffectOperation | undefined> {
    const operation = await requestResult(this.requireDatabase().transaction(EFFECT_STORE, "readonly").objectStore(EFFECT_STORE).get(operationId));
    if (!operation) return undefined;
    assertEffectOperation(operation as EffectOperation);
    return operation as EffectOperation;
  }

  public async updateEffect(operation: EffectOperation): Promise<void> {
    assertEffectOperation(operation);
    const transaction = this.requireDatabase().transaction(EFFECT_STORE, "readwrite");
    transaction.objectStore(EFFECT_STORE).put(operation);
    await transactionDone(transaction);
  }

  public async listEffects(status?: EffectOperation["status"]): Promise<EffectOperation[]> {
    const operations = await requestResult(this.requireDatabase().transaction(EFFECT_STORE, "readonly").objectStore(EFFECT_STORE).getAll());
    operations.forEach((operation) => assertEffectOperation(operation as EffectOperation));
    return (operations as EffectOperation[]).filter((operation) => status === undefined || operation.status === status).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  public async search(query: string): Promise<CanonicalRecord[]> {
    await this.ensureSearchIndex();
    const transaction = this.requireDatabase().transaction(SEARCH_STORE, "readonly");
    const documents = (await requestResult(transaction.objectStore(SEARCH_STORE).getAll())).filter(isSearchDocument);
    const matches = new Map(searchDocuments(documents, query).map((document) => [document.id, document]));
    const records = await this.list();
    return records.filter((record) => matches.has(record.id)).sort((left, right) => (matches.get(right.id)?.modifiedAt ?? "").localeCompare(matches.get(left.id)?.modifiedAt ?? ""));
  }

  public async getSearchHealth(): Promise<SearchIndexMeta> {
    const meta = await requestResult(this.requireDatabase().transaction(SEARCH_META_STORE, "readonly").objectStore(SEARCH_META_STORE).get("default"));
    if (!meta || meta.version !== SEARCH_INDEX_VERSION || typeof meta.valid !== "boolean") return { id: "default", version: SEARCH_INDEX_VERSION, valid: false };
    return meta as SearchIndexMeta;
  }

  public async health(): Promise<StoreHealth> {
    const [records, history, search, artifacts, effects, storage] = await Promise.all([
      this.list(true),
      this.history(),
      this.getSearchHealth(),
      requestResult(this.requireDatabase().transaction(ARTIFACT_STORE, "readonly").objectStore(ARTIFACT_STORE).getAll()),
      this.listEffects(),
      storageEstimate()
    ]);
    return {
      activeRecords: records.filter((record) => !record.deleted).length,
      archivedRecords: records.filter((record) => record.deleted).length,
      historyEntries: history.length,
      artifactPayloads: artifacts.length,
      pendingEffects: effects.filter((effect) => effect.status === "PENDING" || effect.status === "IN_FLIGHT" || effect.status === "FAILED_RETRYABLE" || effect.status === "OUTCOME_UNKNOWN" || effect.status === "RECONCILE").length,
      searchIndexValid: search.valid,
      ...(storage ? { storage } : {})
    };
  }

  public async invalidateSearchIndex(): Promise<void> {
    const transaction = this.requireDatabase().transaction(SEARCH_META_STORE, "readwrite");
    transaction.objectStore(SEARCH_META_STORE).put({ id: "default", version: SEARCH_INDEX_VERSION, valid: false } satisfies SearchIndexMeta);
    await transactionDone(transaction);
  }

  public async exportVault(): Promise<VaultDocument> {
    const artifacts: VaultArtifact[] = [];
    for (const record of await this.list(true)) {
      if (record.recordType !== "artifact") continue;
      const blob = await this.getArtifact(record.id);
      if (!blob) throw new Error(`Artifact payload missing for ${record.id}`);
      if (blob.size > MAX_PORTABLE_ARTIFACT_BYTES) throw new Error("Artifact exceeds the bounded portable Vault limit");
      const mimeType = typeof record.data.mimeType === "string" && record.data.mimeType.length > 0 ? record.data.mimeType : blob.type || "application/octet-stream";
      artifacts.push({ id: record.id, mimeType, dataBase64: await blobToBase64(blob) });
    }
    const presentation = await this.getSetting<unknown>("presentation");
    return withVaultIntegrity({
      format: "OMNEVUM_VAULT",
      version: VAULT_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      records: await this.list(true),
      history: await this.history(),
      artifacts,
      ...(presentation && typeof presentation === "object" && !Array.isArray(presentation) ? { presentation: presentation as Record<string, unknown> } : {})
    });
  }

  public async importVault(input: unknown): Promise<{ imported: number; skipped: number; conflicts: number }> {
    assertVaultDocument(input);
    await verifyVaultIntegrity(input);
    const existing = new Map((await this.list(true)).map((record) => [record.id, record]));
    const existingArtifactIds = new Set<string>();
    for (const artifact of input.artifacts ?? []) {
      if (await this.getArtifact(artifact.id)) existingArtifactIds.add(artifact.id);
    }
    const transaction = this.requireDatabase().transaction([RECORD_STORE, SEARCH_META_STORE, HISTORY_STORE, ARTIFACT_STORE, SETTINGS_STORE], "readwrite");
    const objectStore = transaction.objectStore(RECORD_STORE);
    const searchMetaStore = transaction.objectStore(SEARCH_META_STORE);
    const historyStore = transaction.objectStore(HISTORY_STORE);
    const artifactStore = transaction.objectStore(ARTIFACT_STORE);
    const settingsStore = transaction.objectStore(SETTINGS_STORE);
    let imported = 0;
    let skipped = 0;
    let conflicts = 0;
    const acceptedIds = new Set<string>();

    for (const record of input.records) {
      const current = existing.get(record.id);
      if (!current) {
        objectStore.put(record);
        acceptedIds.add(record.id);
        imported += 1;
      } else if (current.deleted && !record.deleted && record.data.restoreIntent !== "EXPLICIT_USER_RESTORE") {
        conflicts += 1;
        skipped += 1;
      } else if (record.revision > current.revision) {
        objectStore.put(record);
        acceptedIds.add(record.id);
        imported += 1;
      } else if (record.revision === current.revision && stableJson(record) !== stableJson(current)) {
        conflicts += 1;
        skipped += 1;
      } else {
        skipped += 1;
      }
    }

    for (const entry of input.history ?? []) historyStore.put(entry);
    for (const artifact of input.artifacts ?? []) {
      const current = existing.get(artifact.id);
      const payloadMissing = !existingArtifactIds.has(artifact.id);
      if (acceptedIds.has(artifact.id) || !current || payloadMissing) artifactStore.put({ id: artifact.id, blob: base64ToBlob(artifact.dataBase64, artifact.mimeType) });
    }
    if (input.presentation) settingsStore.put({ id: "presentation", value: structuredClone(input.presentation), modifiedAt: new Date().toISOString() });
    searchMetaStore.put({ id: "default", version: SEARCH_INDEX_VERSION, valid: false } satisfies SearchIndexMeta);
    await transactionDone(transaction);
    return { imported, skipped, conflicts };
  }

  public async rebuildSearchIndex(): Promise<void> {
    await this.rebuildSearchIndexInternal();
  }

  public async reclaimDerivedState(): Promise<void> {
    const transaction = this.requireDatabase().transaction([SEARCH_STORE, SEARCH_META_STORE], "readwrite");
    transaction.objectStore(SEARCH_STORE).clear();
    transaction.objectStore(SEARCH_META_STORE).put({ id: "default", version: SEARCH_INDEX_VERSION, valid: false } satisfies SearchIndexMeta);
    await transactionDone(transaction);
  }

  public async exportDiagnostics(): Promise<{
    format: "OMNEVUM_DIAGNOSTICS";
    version: 1;
    exportedAt: string;
    health: StoreHealth;
    search: SearchIndexMeta;
  }> {
    return {
      format: "OMNEVUM_DIAGNOSTICS",
      version: 1,
      exportedAt: new Date().toISOString(),
      health: await this.health(),
      search: await this.getSearchHealth()
    };
  }

  private searchRebuild: Promise<void> | null = null;

  private async ensureSearchIndex(): Promise<void> {
    const health = await this.getSearchHealth();
    if (health.valid) return;
    if (!this.searchRebuild) {
      this.searchRebuild = this.rebuildSearchIndexInternal().finally(() => {
        this.searchRebuild = null;
      });
    }
    await this.searchRebuild;
  }

  private async rebuildSearchIndexInternal(): Promise<void> {
    const records = await this.list();
    const documents: SearchDocument[] = records.map(makeSearchDocument);
    const transaction = this.requireDatabase().transaction([SEARCH_STORE, SEARCH_META_STORE], "readwrite");
    const searchStore = transaction.objectStore(SEARCH_STORE);
    searchStore.clear();
    documents.forEach((document) => searchStore.put(document));
    transaction.objectStore(SEARCH_META_STORE).put({ id: "default", version: SEARCH_INDEX_VERSION, valid: true, rebuiltAt: new Date().toISOString() } satisfies SearchIndexMeta);
    await transactionDone(transaction);
  }

  private requireDatabase(): IDBDatabase {
    if (!this.database) throw new Error("CanonicalStore is not open");
    return this.database;
  }
}

export interface StoreHealth {
  activeRecords: number;
  archivedRecords: number;
  historyEntries: number;
  artifactPayloads: number;
  pendingEffects: number;
  searchIndexValid: boolean;
  storage?: { usageBytes: number; quotaBytes: number; pressure: "NORMAL" | "ELEVATED" };
}

async function storageEstimate(): Promise<StoreHealth["storage"]> {
  const estimate = typeof globalThis.navigator === "undefined" ? undefined : await globalThis.navigator.storage?.estimate();
  if (!estimate || typeof estimate.usage !== "number" || typeof estimate.quota !== "number" || estimate.quota <= 0) return undefined;
  return { usageBytes: estimate.usage, quotaBytes: estimate.quota, pressure: estimate.usage / estimate.quota >= 0.8 ? "ELEVATED" : "NORMAL" };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  return btoa(binary);
}

function base64ToBlob(value: string, mimeType: string): Blob {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}
