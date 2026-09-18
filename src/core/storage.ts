import type { CanonicalRecord, HistoryEntry, VaultArtifact, VaultDocument } from "./model";
import { MAX_PORTABLE_ARTIFACT_BYTES } from "./artifact";
import { VAULT_FORMAT_VERSION } from "./model";
import { isSearchDocument, makeSearchDocument, SEARCH_INDEX_VERSION, searchDocuments, type SearchDocument, type SearchIndexMeta } from "./search";
import { assertEffectOperation, type EffectOperation } from "./effect";
import { withVaultIntegrity, verifyVaultIntegrity } from "./vault";
import { assertCanonicalRecord, assertVaultDocument, isCanonicalRecord, isHistoryEntry } from "./validation";
import { isViewDefinition, VIEW_SETTING } from "./compose";

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

export interface StorageEstimateResult {
  usageBytes: number;
  quotaBytes: number;
}

export interface CanonicalStoreOptions {
  databaseFactory?: IDBFactory;
  estimateStorage?: () => Promise<StorageEstimateResult | undefined>;
  requestPersistentStorage?: () => Promise<boolean | undefined>;
}

export interface DiagnosticsRuntimeState {
  release?: { status: "NOT_PROVIDED" | "IDENTIFIED"; version?: string; sourceRevision?: string; artifactDigest?: string };
  serviceWorker?: { status: "NOT_PROVIDED" | "AVAILABLE" | "UNAVAILABLE"; controlled: boolean; activeState?: string; updateWaiting: boolean };
  packageIntegrity?: { status: "NOT_PROVIDED" | "VERIFIED" | "UNVERIFIED"; artifactDigest?: string };
}

export interface VaultImportPreview {
  recordCount: number;
  historyEntries: number;
  artifactPayloads: number;
  imported: number;
  skipped: number;
  conflicts: number;
  hasPresentation: boolean;
}

export interface RecoverySnapshot {
  format: "OMNEVUM_RECOVERY_SNAPSHOT";
  version: 1;
  exportedAt: string;
  records: unknown[];
  history: unknown[];
  artifacts: VaultArtifact[];
  presentation?: unknown;
  summary: {
    recordCount: number;
    validRecordCount: number;
    invalidRecordCount: number;
    historyCount: number;
    validHistoryCount: number;
    invalidHistoryCount: number;
    artifactPayloadCount: number;
    skippedArtifactPayloadCount: number;
  };
}

export interface RecoveryRepairResult {
  retainedRecords: number;
  removedRecords: number;
  retainedHistory: number;
  removedHistory: number;
  retainedArtifactPayloads: number;
  skippedArtifactPayloads: number;
}

type PersistenceState = "GRANTED" | "DENIED" | "UNAVAILABLE";

export class CanonicalStore {
  private database: IDBDatabase | null = null;
  private persistence: PersistenceState = "UNAVAILABLE";

  public constructor(private readonly databaseName = "omnevum-canonical-v1", private readonly options: CanonicalStoreOptions = {}) {}

  public async open(): Promise<void> {
    if (this.database) return;

    const databaseFactory = this.options.databaseFactory ?? globalThis.indexedDB;
    if (!databaseFactory) throw new Error("IndexedDB is unavailable on this target");
    const request = databaseFactory.open(this.databaseName, 6);
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
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
      request.onblocked = () => reject(new Error("Canonical store upgrade is blocked by another tab; close the older tab and retry."));
    });
    database.onversionchange = () => {
      database.close();
      if (this.database === database) {
        this.database = null;
        this.persistence = "UNAVAILABLE";
      }
    };
    this.database = database;
    this.persistence = await this.requestPersistentStorage();
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
    await this.reclaimDerivedStateUnderPressure();
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
      throw storageWriteError(error);
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
    try {
      await transactionDone(transaction);
    } catch (error) {
      throw storageWriteError(error);
    }
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
    try {
      await transactionDone(transaction);
    } catch (error) {
      throw storageWriteError(error);
    }
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
    try {
      await transactionDone(transaction);
    } catch (error) {
      throw storageWriteError(error);
    }
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
    try {
      await transactionDone(transaction);
    } catch (error) {
      throw storageWriteError(error);
    }
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
    const database = this.requireDatabase();
    const meta = await requestResult(database.transaction(SEARCH_META_STORE, "readonly").objectStore(SEARCH_META_STORE).get("default"));
    if (!meta || meta.version !== SEARCH_INDEX_VERSION || typeof meta.valid !== "boolean") return { id: "default", version: SEARCH_INDEX_VERSION, valid: false, invalidReason: "MISSING" };
    if (!meta.valid) return meta as SearchIndexMeta;

    const [rawRecords, rawDocuments] = await Promise.all([
      requestResult(database.transaction(RECORD_STORE, "readonly").objectStore(RECORD_STORE).getAll()),
      requestResult(database.transaction(SEARCH_STORE, "readonly").objectStore(SEARCH_STORE).getAll())
    ]);
    if (!rawRecords.every(isCanonicalRecord)) return { id: "default", version: SEARCH_INDEX_VERSION, valid: false, invalidReason: "CANONICAL_INVALID" };
    if (!rawDocuments.every(isSearchDocument)) return { id: "default", version: SEARCH_INDEX_VERSION, valid: false, invalidReason: "MALFORMED" };
    const expected = rawRecords.filter((record) => !record.deleted).map(makeSearchDocument);
    const actual = rawDocuments as SearchDocument[];
    const actualById = new Map(actual.map((document) => [document.id, document]));
    const consistent = actual.length === expected.length && actualById.size === actual.length && expected.every((document) => {
      const candidate = actualById.get(document.id);
      return candidate?.terms === document.terms && candidate.modifiedAt === document.modifiedAt;
    });
    return consistent ? meta as SearchIndexMeta : { id: "default", version: SEARCH_INDEX_VERSION, valid: false, invalidReason: "STALE" };
  }

  public async health(): Promise<StoreHealth> {
    const storage = await this.readStorageHealth();
    const reclaimedDerivedState = storage?.pressure === "ELEVATED" ? await this.reclaimDerivedState() : false;
    const [records, history, search, artifacts, effects] = await Promise.all([
      this.list(true),
      this.history(),
      this.getSearchHealth(),
      requestResult(this.requireDatabase().transaction(ARTIFACT_STORE, "readonly").objectStore(ARTIFACT_STORE).getAll()),
      this.listEffects()
    ]);
    return {
      activeRecords: records.filter((record) => !record.deleted).length,
      archivedRecords: records.filter((record) => record.deleted).length,
      historyEntries: history.length,
      artifactPayloads: artifacts.length,
      pendingEffects: effects.filter((effect) => effect.status === "PENDING" || effect.status === "IN_FLIGHT" || effect.status === "FAILED_RETRYABLE" || effect.status === "OUTCOME_UNKNOWN" || effect.status === "RECONCILE").length,
      searchIndexValid: search.valid,
      ...(storage ? { storage: { ...storage, reclaimedDerivedState } } : {})
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
    const composeViews = await this.getSetting<unknown>(VIEW_SETTING);
    const presentationOverlay = presentation && typeof presentation === "object" && !Array.isArray(presentation) ? { ...(presentation as Record<string, unknown>) } : {};
    if (Array.isArray(composeViews) && composeViews.length <= 40 && composeViews.every(isViewDefinition)) presentationOverlay.composeViews = structuredClone(composeViews);
    return withVaultIntegrity({
      format: "OMNEVUM_VAULT",
      version: VAULT_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      records: await this.list(true),
      history: await this.history(),
      artifacts,
      ...(Object.keys(presentationOverlay).length > 0 ? { presentation: presentationOverlay } : {})
    });
  }

  public async exportRetainedState(): Promise<VaultDocument | RecoverySnapshot> {
    try {
      return await this.exportVault();
    } catch {
      return this.exportRecoverySnapshot();
    }
  }

  public async repairFromRecoverySnapshot(input: unknown): Promise<RecoveryRepairResult> {
    if (!isRecoverySnapshot(input)) throw new Error("Recovery snapshot is invalid");
    const snapshot = input;
    const records = snapshot.records.filter(isCanonicalRecord);
    if (snapshot.records.length > 0 && records.length === 0) throw new Error("Recovery snapshot contains no valid canonical records");
    const recordIds = new Set(records.map((record) => record.id));
    const history = snapshot.history.filter(isHistoryEntry).filter((entry) => recordIds.has(entry.recordId));
    const artifacts: Array<{ id: string; blob: Blob }> = [];
    let skippedArtifactPayloads = 0;
    for (const artifact of snapshot.artifacts) {
      if (!isRecoveryArtifact(artifact) || !recordIds.has(artifact.id) || !records.some((record) => record.id === artifact.id && record.recordType === "artifact")) {
        skippedArtifactPayloads += 1;
        continue;
      }
      try {
        const blob = base64ToBlob(artifact.dataBase64, artifact.mimeType);
        if (blob.size > MAX_PORTABLE_ARTIFACT_BYTES) throw new Error("Artifact exceeds the bounded portable Vault limit");
        artifacts.push({ id: artifact.id, blob });
      } catch {
        skippedArtifactPayloads += 1;
      }
    }

    const transaction = this.requireDatabase().transaction([RECORD_STORE, SEARCH_STORE, SEARCH_META_STORE, HISTORY_STORE, ARTIFACT_STORE], "readwrite");
    transaction.objectStore(RECORD_STORE).clear();
    transaction.objectStore(SEARCH_STORE).clear();
    transaction.objectStore(SEARCH_META_STORE).put({ id: "default", version: SEARCH_INDEX_VERSION, valid: false, invalidReason: "RECOVERY_REPAIR" } satisfies SearchIndexMeta);
    transaction.objectStore(HISTORY_STORE).clear();
    transaction.objectStore(ARTIFACT_STORE).clear();
    records.forEach((record) => transaction.objectStore(RECORD_STORE).put(record));
    history.forEach((entry) => transaction.objectStore(HISTORY_STORE).put(entry));
    artifacts.forEach((artifact) => transaction.objectStore(ARTIFACT_STORE).put(artifact));
    await transactionDone(transaction);

    return {
      retainedRecords: records.length,
      removedRecords: snapshot.records.length - records.length,
      retainedHistory: history.length,
      removedHistory: snapshot.history.length - history.length,
      retainedArtifactPayloads: artifacts.length,
      skippedArtifactPayloads
    };
  }

  private async exportRecoverySnapshot(): Promise<RecoverySnapshot> {
    const database = this.requireDatabase();
    const [records, history] = await Promise.all([
      requestResult(database.transaction(RECORD_STORE, "readonly").objectStore(RECORD_STORE).getAll()),
      requestResult(database.transaction(HISTORY_STORE, "readonly").objectStore(HISTORY_STORE).getAll())
    ]);
    const artifacts: VaultArtifact[] = [];
    let skippedArtifactPayloadCount = 0;
    for (const candidate of records) {
      if (!isRawArtifactRecord(candidate)) continue;
      const blob = await this.getArtifact(candidate.id);
      if (!blob || blob.size > MAX_PORTABLE_ARTIFACT_BYTES) {
        skippedArtifactPayloadCount += 1;
        continue;
      }
      artifacts.push({ id: candidate.id, mimeType: rawArtifactMimeType(candidate, blob), dataBase64: await blobToBase64(blob) });
    }
    const presentation = await this.getSetting<unknown>("presentation");
    return {
      format: "OMNEVUM_RECOVERY_SNAPSHOT",
      version: 1,
      exportedAt: new Date().toISOString(),
      records,
      history,
      artifacts,
      ...(presentation === undefined ? {} : { presentation: structuredClone(presentation) }),
      summary: {
        recordCount: records.length,
        validRecordCount: records.filter(isCanonicalRecord).length,
        invalidRecordCount: records.filter((record) => !isCanonicalRecord(record)).length,
        historyCount: history.length,
        validHistoryCount: history.filter(isHistoryEntry).length,
        invalidHistoryCount: history.filter((entry) => !isHistoryEntry(entry)).length,
        artifactPayloadCount: artifacts.length,
        skippedArtifactPayloadCount
      }
    };
  }

  public async previewVault(input: unknown): Promise<VaultImportPreview> {
    const vault = await this.validateVaultInput(input);
    const existing = new Map((await this.list(true)).map((record) => [record.id, record]));
    let imported = 0;
    let skipped = 0;
    let conflicts = 0;
    for (const record of vault.records) {
      const disposition = importDisposition(record, existing.get(record.id));
      if (disposition === "IMPORT") imported += 1;
      else if (disposition === "CONFLICT") conflicts += 1;
      else skipped += 1;
    }
    return { recordCount: vault.records.length, historyEntries: vault.history?.length ?? 0, artifactPayloads: vault.artifacts?.length ?? 0, imported, skipped, conflicts, hasPresentation: vault.presentation !== undefined };
  }

  public async importVault(input: unknown): Promise<{ imported: number; skipped: number; conflicts: number }> {
    const vault = await this.validateVaultInput(input);
    await this.reclaimDerivedStateUnderPressure();
    const existing = new Map((await this.list(true)).map((record) => [record.id, record]));
    const existingArtifactIds = new Set<string>();
    for (const artifact of vault.artifacts ?? []) {
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

    for (const record of vault.records) {
      const current = existing.get(record.id);
      const disposition = importDisposition(record, current);
      if (disposition === "IMPORT") {
        objectStore.put(record);
        acceptedIds.add(record.id);
        imported += 1;
      } else if (disposition === "CONFLICT") {
        conflicts += 1;
        skipped += 1;
      } else {
        skipped += 1;
      }
    }

    for (const entry of vault.history ?? []) historyStore.put(entry);
    for (const artifact of vault.artifacts ?? []) {
      const current = existing.get(artifact.id);
      const payloadMissing = !existingArtifactIds.has(artifact.id);
      if (acceptedIds.has(artifact.id) || !current || payloadMissing) artifactStore.put({ id: artifact.id, blob: base64ToBlob(artifact.dataBase64, artifact.mimeType) });
    }
    if (vault.presentation) {
      const { composeViews, ...presentation } = vault.presentation;
      settingsStore.put({ id: "presentation", value: structuredClone(presentation), modifiedAt: new Date().toISOString() });
      if (composeViews !== undefined) {
        settingsStore.put({ id: VIEW_SETTING, value: structuredClone(composeViews), modifiedAt: new Date().toISOString() });
      }
    }
    searchMetaStore.put({ id: "default", version: SEARCH_INDEX_VERSION, valid: false } satisfies SearchIndexMeta);
    try {
      await transactionDone(transaction);
    } catch (error) {
      throw storageWriteError(error);
    }
    return { imported, skipped, conflicts };
  }

  public async rebuildSearchIndex(): Promise<void> {
    await this.rebuildSearchIndexInternal();
  }

  public async reclaimDerivedState(): Promise<boolean> {
    const transaction = this.requireDatabase().transaction([SEARCH_STORE, SEARCH_META_STORE], "readwrite");
    transaction.objectStore(SEARCH_STORE).clear();
    transaction.objectStore(SEARCH_META_STORE).put({ id: "default", version: SEARCH_INDEX_VERSION, valid: false, invalidReason: "PRESSURE_RECLAIM" } satisfies SearchIndexMeta);
    await transactionDone(transaction);
    return true;
  }

  public async exportDiagnostics(runtime: DiagnosticsRuntimeState = {}): Promise<{
    format: "OMNEVUM_DIAGNOSTICS";
    version: 1;
    exportedAt: string;
    release: NonNullable<DiagnosticsRuntimeState["release"]>;
    storage: { databaseVersion: 6; recordSchemaVersion: 1; vaultFormatVersion: 1; pressure: "NORMAL" | "ELEVATED" | "UNKNOWN"; persistence: PersistenceState; reclaimedDerivedState: boolean };
    backup: { vaultExportable: boolean; offOriginStatus: "UNKNOWN" };
    serviceWorker: NonNullable<DiagnosticsRuntimeState["serviceWorker"]>;
    packageIntegrity: NonNullable<DiagnosticsRuntimeState["packageIntegrity"]>;
    connectors: { status: "NONE_ADMITTED" };
    sync: { status: "CONTRACT_ONLY" };
    health: StoreHealth;
    search: SearchIndexMeta;
  }> {
    const health = await this.health();
    let vaultExportable = false;
    try {
      await this.exportVault();
      vaultExportable = true;
    } catch {
      vaultExportable = false;
    }
    return {
      format: "OMNEVUM_DIAGNOSTICS",
      version: 1,
      exportedAt: new Date().toISOString(),
      release: runtime.release ?? { status: "NOT_PROVIDED" },
      storage: {
        databaseVersion: 6,
        recordSchemaVersion: 1,
        vaultFormatVersion: 1,
        pressure: health.storage?.pressure ?? "UNKNOWN",
        persistence: health.storage?.persistence ?? "UNAVAILABLE",
        reclaimedDerivedState: health.storage?.reclaimedDerivedState ?? false
      },
      backup: { vaultExportable, offOriginStatus: "UNKNOWN" },
      serviceWorker: runtime.serviceWorker ?? { status: "NOT_PROVIDED", controlled: false, updateWaiting: false },
      packageIntegrity: runtime.packageIntegrity ?? { status: "NOT_PROVIDED" },
      connectors: { status: "NONE_ADMITTED" },
      sync: { status: "CONTRACT_ONLY" },
      health,
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

  private async reclaimDerivedStateUnderPressure(): Promise<void> {
    const storage = await this.readStorageHealth();
    if (storage?.pressure === "ELEVATED") await this.reclaimDerivedState();
  }

  private async readStorageHealth(): Promise<Omit<NonNullable<StoreHealth["storage"]>, "reclaimedDerivedState"> | undefined> {
    const estimate = await (this.options.estimateStorage?.() ?? defaultStorageEstimate());
    if (!estimate || estimate.quotaBytes <= 0 || !Number.isFinite(estimate.usageBytes) || !Number.isFinite(estimate.quotaBytes)) return undefined;
    return {
      usageBytes: estimate.usageBytes,
      quotaBytes: estimate.quotaBytes,
      pressure: estimate.usageBytes / estimate.quotaBytes >= 0.8 ? "ELEVATED" : "NORMAL",
      persistence: this.persistence
    };
  }

  private async requestPersistentStorage(): Promise<PersistenceState> {
    try {
      const result = await (this.options.requestPersistentStorage?.() ?? defaultRequestPersistentStorage());
      return result === undefined ? "UNAVAILABLE" : result ? "GRANTED" : "DENIED";
    } catch {
      return "DENIED";
    }
  }

  private async validateVaultInput(input: unknown): Promise<VaultDocument> {
    assertVaultDocument(input);
    await verifyVaultIntegrity(input);
    const importedComposeViews = input.presentation?.composeViews;
    if (importedComposeViews !== undefined && (!Array.isArray(importedComposeViews) || importedComposeViews.length > 40 || !importedComposeViews.every(isViewDefinition))) throw new Error("Vault contains invalid Compose views");
    return input;
  }
}

export interface StoreHealth {
  activeRecords: number;
  archivedRecords: number;
  historyEntries: number;
  artifactPayloads: number;
  pendingEffects: number;
  searchIndexValid: boolean;
  storage?: { usageBytes: number; quotaBytes: number; pressure: "NORMAL" | "ELEVATED"; persistence: PersistenceState; reclaimedDerivedState: boolean };
}

async function defaultStorageEstimate(): Promise<StorageEstimateResult | undefined> {
  const estimate = typeof globalThis.navigator === "undefined" ? undefined : await globalThis.navigator.storage?.estimate();
  if (!estimate || typeof estimate.usage !== "number" || typeof estimate.quota !== "number" || estimate.quota <= 0) return undefined;
  return { usageBytes: estimate.usage, quotaBytes: estimate.quota };
}

async function defaultRequestPersistentStorage(): Promise<boolean | undefined> {
  const persist = typeof globalThis.navigator === "undefined" ? undefined : globalThis.navigator.storage?.persist;
  if (typeof persist !== "function") return undefined;
  return persist.call(globalThis.navigator.storage);
}

function storageWriteError(error: unknown): Error {
  const name = error && typeof error === "object" && "name" in error ? String((error as { name?: unknown }).name) : "";
  if (name === "QuotaExceededError") return new Error("Storage quota is exhausted. Export a Vault, then retry after replaceable state is reclaimed.");
  return error instanceof Error ? error : new Error("IndexedDB write failed");
}

function isRawArtifactRecord(value: unknown): value is { id: string; recordType: "artifact"; data?: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value) && typeof (value as { id?: unknown }).id === "string" && (value as { id: string }).id.length > 0 && (value as { id: string }).id.length <= 160 && (value as { recordType?: unknown }).recordType === "artifact";
}

function rawArtifactMimeType(candidate: { data?: unknown }, blob: Blob): string {
  const data = candidate.data;
  const mimeType = data && typeof data === "object" && !Array.isArray(data) ? (data as { mimeType?: unknown }).mimeType : undefined;
  return typeof mimeType === "string" && mimeType.length > 0 && mimeType.length <= 255 ? mimeType : blob.type || "application/octet-stream";
}

function isRecoverySnapshot(value: unknown): value is RecoverySnapshot {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && (value as { format?: unknown }).format === "OMNEVUM_RECOVERY_SNAPSHOT"
    && (value as { version?: unknown }).version === 1
    && Array.isArray((value as { records?: unknown }).records)
    && Array.isArray((value as { history?: unknown }).history)
    && Array.isArray((value as { artifacts?: unknown }).artifacts);
}

function isRecoveryArtifact(value: unknown): value is VaultArtifact {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && typeof (value as { id?: unknown }).id === "string"
    && (value as { id: string }).id.length > 0
    && (value as { id: string }).id.length <= 160
    && typeof (value as { mimeType?: unknown }).mimeType === "string"
    && (value as { mimeType: string }).mimeType.length > 0
    && (value as { mimeType: string }).mimeType.length <= 255
    && typeof (value as { dataBase64?: unknown }).dataBase64 === "string"
    && (value as { dataBase64: string }).dataBase64.length <= Math.ceil(MAX_PORTABLE_ARTIFACT_BYTES / 3) * 4 + 4;
}

function importDisposition(record: CanonicalRecord, current: CanonicalRecord | undefined): "IMPORT" | "SKIP" | "CONFLICT" {
  if (current?.deleted && !record.deleted && record.data.restoreIntent !== "EXPLICIT_USER_RESTORE") return "CONFLICT";
  if (!current || record.revision > current.revision) return "IMPORT";
  if (record.revision === current.revision && stableJson(record) !== stableJson(current)) return "CONFLICT";
  return "SKIP";
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
