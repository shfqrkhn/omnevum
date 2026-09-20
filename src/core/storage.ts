import type { CanonicalRecord, HistoryEntry, VaultArtifact, VaultDocument, VaultPackageAutomation, VaultPackageState } from "./model";
import { MAX_PORTABLE_ARTIFACT_BYTES } from "./artifact";
import { VAULT_FORMAT_VERSION } from "./model";
import { isSearchDocument, makeSearchDocument, SEARCH_INDEX_VERSION, searchDocuments, type SearchDocument, type SearchIndexMeta } from "./search";
import { assertEffectOperation, type EffectOperation } from "./effect";
import { fingerprintVault, withVaultIntegrity, verifyVaultIntegrity } from "./vault";
import { assertCanonicalRecord, assertVaultDocument, assertVaultPackageState, isCanonicalRecord, isHistoryEntry, isVaultPackageAutomation, isVaultPackageState, MAX_VAULT_AUTOMATION_RULES, MAX_VAULT_PACKAGE_STATES } from "./validation";
import { isViewDefinition, VIEW_SETTING } from "./compose";
import { enumerateRetirementCopies, parseRetirementCopyObservations, type RetirementCopyInventory, type RetirementCopyObservation } from "./retirement";
import type { VerifiedBackup } from "./migration";

const RECORD_STORE = "records";
const SEARCH_STORE = "searchDocuments";
const SEARCH_META_STORE = "searchMeta";
const HISTORY_STORE = "history";
const SETTINGS_STORE = "settings";
const ARTIFACT_STORE = "artifactBlobs";
const EFFECT_STORE = "effects";
const PACKAGE_STATE_PREFIX = "packageState:";
const AUTOMATION_RULES_SETTING_ID = "automation.rules";
const VERIFIED_BACKUP_SETTING_ID = "updates.verifiedBackup";
const RETIREMENT_AUTHORIZATION_SETTING_ID = "recovery.retirementAuthorization";
const RETIREMENT_COPY_INVENTORY_SETTING_ID = "recovery.retirementCopyInventory";

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

function parseCanonicalStoreChange(value: unknown): CanonicalStoreChange | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  if (candidate.kind === "STORE_CLEARED" && Object.keys(candidate).length === 1) return { kind: "STORE_CLEARED" };
  if (candidate.kind === "CANONICAL_CHANGED" && Object.keys(candidate).length === 2 && Array.isArray(candidate.recordIds) && candidate.recordIds.length <= 200 && candidate.recordIds.every((id) => typeof id === "string" && id.length > 0 && id.length <= 200)) {
    return { kind: "CANONICAL_CHANGED", recordIds: [...candidate.recordIds] as string[] };
  }
  if (candidate.kind === "SETTING_CHANGED" && Object.keys(candidate).length === 2 && typeof candidate.settingId === "string" && candidate.settingId.length > 0 && candidate.settingId.length <= 120) {
    return { kind: "SETTING_CHANGED", settingId: candidate.settingId };
  }
  if (candidate.kind === "EFFECT_CHANGED" && Object.keys(candidate).length === 2 && typeof candidate.operationId === "string" && candidate.operationId.length > 0 && candidate.operationId.length <= 200) {
    return { kind: "EFFECT_CHANGED", operationId: candidate.operationId };
  }
  return undefined;
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

export type CanonicalStoreChange =
  | { kind: "CANONICAL_CHANGED"; recordIds: string[] }
  | { kind: "STORE_CLEARED" }
  | { kind: "SETTING_CHANGED"; settingId: string }
  | { kind: "EFFECT_CHANGED"; operationId: string };

export class EffectStateConflictError extends Error {
  public constructor() {
    super("Effect state changed before the operation could be updated");
    this.name = "EffectStateConflictError";
  }
}

export interface CanonicalWrite {
  record: CanonicalRecord;
  artifactBlob?: Blob;
  expectedPreviousRevision?: number;
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
  packageStates: number;
  automationRules: number;
}

export interface RecoverySnapshot {
  format: "OMNEVUM_RECOVERY_SNAPSHOT";
  version: 1;
  exportedAt: string;
  records: unknown[];
  history: unknown[];
  artifacts: VaultArtifact[];
  packageStates?: VaultPackageState[];
  automationRules?: VaultPackageAutomation[];
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
  retainedPackageStates: number;
  skippedPackageStates: number;
  retainedAutomationRules: number;
  skippedAutomationRules: number;
}

export interface CanonicalClearImpact {
  canonicalRecords: number;
  relationships: number;
  orphanedRelationships: number;
  historyEntries: number;
  artifactPayloads: number;
  effectOperations: number;
  pendingEffects: number;
  packageStates: number;
  automationRules: number;
  preservedRelationships: number;
  reversibilityWindowSeconds: number;
}

export type RetirementAuthorizationKind = "VERIFIED_VAULT_EXPORT" | "EXPLICIT_DESTROY_INTENT";

interface RetirementAuthorizationBase {
  kind: RetirementAuthorizationKind;
  recordedAt: string;
}

export interface VerifiedVaultRetirementAuthorization extends RetirementAuthorizationBase {
  kind: "VERIFIED_VAULT_EXPORT";
  vaultFingerprint: string;
  recordCount: number;
  sizeBytes: number;
}

export interface ExplicitDestroyRetirementAuthorization extends RetirementAuthorizationBase {
  kind: "EXPLICIT_DESTROY_INTENT";
}

export type RetirementAuthorization = VerifiedVaultRetirementAuthorization | ExplicitDestroyRetirementAuthorization;

type PersistenceState = "GRANTED" | "DENIED" | "UNAVAILABLE";

export class CanonicalStore {
  private database: IDBDatabase | null = null;
  private persistence: PersistenceState = "UNAVAILABLE";
  private changeChannel: BroadcastChannel | null = null;
  private pressureEpisode: "NORMAL" | "ELEVATED" | "UNKNOWN" = "UNKNOWN";
  private pressureReclaimed = false;
  private readonly changeListeners = new Set<(change: CanonicalStoreChange) => void>();

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
        this.changeChannel?.close();
        this.changeChannel = null;
      }
    };
    this.database = database;
    this.persistence = await this.requestPersistentStorage();
    this.openChangeChannel();
  }

  public close(): void {
    this.database?.close();
    this.database = null;
    this.changeChannel?.close();
    this.changeChannel = null;
  }

  public subscribe(listener: (change: CanonicalStoreChange) => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
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
    await this.putMany([{
      record,
      ...(artifactBlob ? { artifactBlob } : {}),
      ...(expectedPreviousRevision !== undefined ? { expectedPreviousRevision } : {})
    }]);
  }

  public async putMany(writes: CanonicalWrite[]): Promise<void> {
    if (writes.length === 0) return;
    writes.forEach(({ record }) => assertCanonicalRecord(record));
    await this.reclaimDerivedStateUnderPressure();
    const transaction = this.requireDatabase().transaction([RECORD_STORE, SEARCH_META_STORE, HISTORY_STORE, ARTIFACT_STORE], "readwrite");
    const recordStore = transaction.objectStore(RECORD_STORE);
    const currentRequest = recordStore.getAll();
    let revisionConflict = false;
    currentRequest.onsuccess = () => {
      const currentById = new Map<string, CanonicalRecord>(
        (currentRequest.result as CanonicalRecord[]).map((current) => [current.id, current])
      );
      for (const write of writes) {
        const current = currentById.get(write.record.id);
        if ((write.expectedPreviousRevision !== undefined && (!current || current.revision !== write.expectedPreviousRevision)) || (write.expectedPreviousRevision === undefined && current && write.record.revision <= current.revision)) {
          revisionConflict = true;
          transaction.abort();
          return;
        }
        currentById.set(write.record.id, write.record);
      }
      for (const write of writes) {
        recordStore.put(write.record);
        transaction.objectStore(SEARCH_META_STORE).put({ id: "default", version: SEARCH_INDEX_VERSION, valid: false } satisfies SearchIndexMeta);
        transaction.objectStore(HISTORY_STORE).put({ id: `${write.record.id}:${write.record.revision}`, recordId: write.record.id, revision: write.record.revision, recordedAt: new Date().toISOString(), record: write.record } satisfies HistoryEntry);
        if (write.artifactBlob) transaction.objectStore(ARTIFACT_STORE).put({ id: write.record.id, blob: write.artifactBlob });
      }
    };
    try {
      await transactionDone(transaction);
    } catch (error) {
      if (revisionConflict) throw new Error("Canonical revision conflict");
      throw storageWriteError(error);
    }
    this.publishChange({ kind: "CANONICAL_CHANGED", recordIds: writes.map(({ record }) => record.id) });
  }

  public async recordVerifiedVaultExport(input: unknown, sizeBytes: number): Promise<VerifiedVaultRetirementAuthorization> {
    const vault = await this.validateVaultInput(input);
    if (!vault.integrity) throw new Error("Verified retirement export must carry a Vault integrity receipt");
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) throw new Error("Verified retirement export size is invalid");
    const authorization: VerifiedVaultRetirementAuthorization = {
      kind: "VERIFIED_VAULT_EXPORT",
      recordedAt: new Date().toISOString(),
      vaultFingerprint: await fingerprintVault(vault),
      recordCount: vault.records.length,
      sizeBytes
    };
    await this.setSetting(RETIREMENT_AUTHORIZATION_SETTING_ID, authorization);
    return authorization;
  }

  public async recordVerifiedBackup(input: unknown, sizeBytes: number): Promise<VerifiedBackup> {
    const vault = await this.validateVaultInput(input);
    if (!vault.integrity) throw new Error("Verified backup must carry a Vault integrity receipt");
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) throw new Error("Verified backup size is invalid");
    const backup: VerifiedBackup = {
      verifiedAt: new Date().toISOString(),
      digest: await fingerprintVault(vault),
      recordCount: vault.records.length,
      artifactCount: vault.artifacts?.length ?? 0
    };
    await this.setSetting(VERIFIED_BACKUP_SETTING_ID, { ...backup, sizeBytes });
    return backup;
  }

  public async getVerifiedBackup(): Promise<VerifiedBackup | undefined> {
    const value = await this.getSetting<unknown>(VERIFIED_BACKUP_SETTING_ID);
    if (!isVerifiedBackup(value)) return undefined;
    try {
      const current = await this.exportVault();
      if (await fingerprintVault(current) !== value.digest) return undefined;
    } catch {
      return undefined;
    }
    const { sizeBytes: _sizeBytes, ...backup } = value;
    return structuredClone(backup);
  }

  public async recordExplicitDestroyIntent(): Promise<ExplicitDestroyRetirementAuthorization> {
    const authorization: ExplicitDestroyRetirementAuthorization = { kind: "EXPLICIT_DESTROY_INTENT", recordedAt: new Date().toISOString() };
    await this.setSetting(RETIREMENT_AUTHORIZATION_SETTING_ID, authorization);
    return authorization;
  }

  public async getRetirementAuthorization(): Promise<RetirementAuthorization | undefined> {
    const value = await this.getSetting<unknown>(RETIREMENT_AUTHORIZATION_SETTING_ID);
    if (!isRetirementAuthorization(value)) return undefined;
    if (value.kind === "VERIFIED_VAULT_EXPORT") {
      try {
        const current = await this.exportVault();
        if (await fingerprintVault(current) !== value.vaultFingerprint) return undefined;
      } catch {
        return undefined;
      }
    }
    return structuredClone(value);
  }

  public async getRetirementCopyInventory(): Promise<RetirementCopyInventory | undefined> {
    const value = await this.getSetting<unknown>(RETIREMENT_COPY_INVENTORY_SETTING_ID);
    const copies = parseRetirementCopyObservations(value);
    return copies ? enumerateRetirementCopies(copies) : undefined;
  }

  public async setRetirementCopyInventory(copies: readonly RetirementCopyObservation[]): Promise<RetirementCopyInventory> {
    const inventory = enumerateRetirementCopies(copies);
    await this.setSetting(RETIREMENT_COPY_INVENTORY_SETTING_ID, { version: 1, copies: inventory.copies });
    return inventory;
  }

  public async clear(authorizationKind: RetirementAuthorizationKind): Promise<void> {
    const authorization = await this.getRetirementAuthorization();
    if (!authorization || authorization.kind !== authorizationKind) throw new Error("Retirement is blocked until a verified Vault export or explicit destroy intent is recorded");
    if (authorization.kind === "VERIFIED_VAULT_EXPORT") {
      const current = await this.exportVault();
      if (await fingerprintVault(current) !== authorization.vaultFingerprint) throw new Error("Verified Vault export is stale; export and read back the current state before retirement");
    }
    const retirementCopyInventory = await this.getRetirementCopyInventory();
    const unresolvedRemoteCopies = retirementCopyInventory?.copies.filter((copy) => copy.configured && copy.kind !== "LOCAL_ORIGIN" && copy.state !== "VERIFIED_DELETED") ?? [];
    if (unresolvedRemoteCopies.length > 0) throw new Error("Retirement is blocked until every configured remote copy is verified deleted");
    const retiredCopyInventory = retirementCopyInventory
      ? enumerateRetirementCopies(retirementCopyInventory.copies.map((copy) => copy.kind === "LOCAL_ORIGIN" && copy.configured
        ? { ...copy, state: "VERIFIED_DELETED", observedAt: new Date().toISOString() }
        : copy))
      : undefined;
    const settings = await requestResult(this.requireDatabase().transaction(SETTINGS_STORE, "readonly").objectStore(SETTINGS_STORE).getAll());
    const packageSettingIds = settings
      .filter((setting) => typeof setting?.id === "string" && setting.id.startsWith(PACKAGE_STATE_PREFIX))
      .map((setting) => setting.id as string);
    const transaction = this.requireDatabase().transaction([RECORD_STORE, SEARCH_STORE, SEARCH_META_STORE, HISTORY_STORE, ARTIFACT_STORE, EFFECT_STORE, SETTINGS_STORE], "readwrite");
    transaction.objectStore(RECORD_STORE).clear();
    transaction.objectStore(SEARCH_STORE).clear();
    transaction.objectStore(SEARCH_META_STORE).put({ id: "default", version: SEARCH_INDEX_VERSION, valid: true, rebuiltAt: new Date().toISOString() } satisfies SearchIndexMeta);
    transaction.objectStore(HISTORY_STORE).clear();
    transaction.objectStore(ARTIFACT_STORE).clear();
    transaction.objectStore(EFFECT_STORE).clear();
    const settingsStore = transaction.objectStore(SETTINGS_STORE);
    packageSettingIds.forEach((id) => settingsStore.delete(id));
    settingsStore.delete(AUTOMATION_RULES_SETTING_ID);
    settingsStore.delete(RETIREMENT_AUTHORIZATION_SETTING_ID);
    if (retiredCopyInventory) settingsStore.put({ id: RETIREMENT_COPY_INVENTORY_SETTING_ID, value: { version: 1, copies: retiredCopyInventory.copies }, modifiedAt: new Date().toISOString() });
    try {
      await transactionDone(transaction);
    } catch (error) {
      throw storageWriteError(error);
    }
    this.publishChange({ kind: "STORE_CLEARED" });
  }

  public async getClearImpact(): Promise<CanonicalClearImpact> {
    const [records, history, artifacts, effects, packageStates, automationRules] = await Promise.all([
      this.list(true),
      this.history(),
      requestResult(this.requireDatabase().transaction(ARTIFACT_STORE, "readonly").objectStore(ARTIFACT_STORE).getAll()),
      this.listEffects(),
      this.listPackageStates(),
      this.getAutomationRules()
    ]);
    const recordIds = new Set(records.map((record) => record.id));
    const relationships = records.filter((record) => record.recordType === "relationship");
    const orphanedRelationships = relationships.filter((relationship) => {
      const sourceId = relationship.data.sourceId;
      const targetId = relationship.data.targetId;
      return typeof sourceId !== "string" || typeof targetId !== "string" || !recordIds.has(sourceId) || !recordIds.has(targetId);
    }).length;
    return {
      canonicalRecords: records.length,
      relationships: relationships.length,
      orphanedRelationships,
      historyEntries: history.length,
      artifactPayloads: artifacts.length,
      effectOperations: effects.length,
      pendingEffects: effects.filter((effect) => ["PENDING", "IN_FLIGHT", "FAILED_RETRYABLE", "OUTCOME_UNKNOWN", "RECONCILE"].includes(effect.status)).length,
      packageStates: packageStates.length,
      automationRules: automationRules.length,
      preservedRelationships: 0,
      reversibilityWindowSeconds: 0
    };
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
    this.publishChange({ kind: "SETTING_CHANGED", settingId: id });
  }

  public async getPackageState(packageId: string): Promise<VaultPackageState | undefined> {
    const value = await this.getSetting<unknown>(packageStateSettingId(packageId));
    return isVaultPackageState(value) ? structuredClone(value) : undefined;
  }

  public async setPackageState(state: VaultPackageState): Promise<void> {
    assertVaultPackageState(state);
    await this.setSetting(packageStateSettingId(state.packageId), structuredClone(state));
  }

  public async listPackageStates(): Promise<VaultPackageState[]> {
    const settings = await requestResult(this.requireDatabase().transaction(SETTINGS_STORE, "readonly").objectStore(SETTINGS_STORE).getAll());
    return settings
      .filter((setting) => typeof setting?.id === "string" && setting.id.startsWith(PACKAGE_STATE_PREFIX) && isVaultPackageState(setting.value))
      .map((setting) => structuredClone(setting.value as VaultPackageState))
      .sort((left, right) => left.packageId.localeCompare(right.packageId));
  }

  public async getAutomationRules(): Promise<VaultPackageAutomation[]> {
    const value = await this.getSetting<unknown>(AUTOMATION_RULES_SETTING_ID);
    if (!Array.isArray(value) || value.length > MAX_VAULT_AUTOMATION_RULES || !value.every(isVaultPackageAutomation)) return [];
    return structuredClone(value);
  }

  public async setAutomationRules(rules: VaultPackageAutomation[]): Promise<void> {
    if (rules.length > MAX_VAULT_AUTOMATION_RULES || !rules.every(isVaultPackageAutomation) || new Set(rules.map((rule) => rule.ruleId)).size !== rules.length) throw new Error("Invalid Vault package automation rules");
    await this.setSetting(AUTOMATION_RULES_SETTING_ID, structuredClone(rules));
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
    this.publishChange({ kind: "EFFECT_CHANGED", operationId: operation.operationId });
  }

  public async getEffect(operationId: string): Promise<EffectOperation | undefined> {
    const operation = await requestResult(this.requireDatabase().transaction(EFFECT_STORE, "readonly").objectStore(EFFECT_STORE).get(operationId));
    if (!operation) return undefined;
    assertEffectOperation(operation as EffectOperation);
    return operation as EffectOperation;
  }

  public async updateEffect(operation: EffectOperation, expectedStatus?: EffectOperation["status"]): Promise<void> {
    assertEffectOperation(operation);
    const transaction = this.requireDatabase().transaction(EFFECT_STORE, "readwrite");
    const effectStore = transaction.objectStore(EFFECT_STORE);
    let stateConflict = false;
    const currentRequest = effectStore.get(operation.operationId);
    currentRequest.onsuccess = () => {
      const current = currentRequest.result as EffectOperation | undefined;
      if (expectedStatus !== undefined && current?.status !== expectedStatus) {
        stateConflict = true;
        transaction.abort();
        return;
      }
      effectStore.put(operation);
    };
    try {
      await transactionDone(transaction);
    } catch (error) {
      if (stateConflict) throw new EffectStateConflictError();
      throw storageWriteError(error);
    }
    this.publishChange({ kind: "EFFECT_CHANGED", operationId: operation.operationId });
  }

  public async listEffects(status?: EffectOperation["status"]): Promise<EffectOperation[]> {
    const operations = await requestResult(this.requireDatabase().transaction(EFFECT_STORE, "readonly").objectStore(EFFECT_STORE).getAll());
    operations.forEach((operation) => assertEffectOperation(operation as EffectOperation));
    return (operations as EffectOperation[]).filter((operation) => status === undefined || operation.status === status).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  public async search(query: string, allowedIds?: ReadonlySet<string>): Promise<CanonicalRecord[]> {
    await this.ensureSearchIndex();
    const transaction = this.requireDatabase().transaction(SEARCH_STORE, "readonly");
    const documents = (await requestResult(transaction.objectStore(SEARCH_STORE).getAll())).filter(isSearchDocument);
    const scopedDocuments = allowedIds ? documents.filter((document) => allowedIds.has(document.id)) : documents;
    const matches = new Map(searchDocuments(scopedDocuments, query).map((document) => [document.id, document]));
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
    const reclaimedDerivedState = await this.reclaimDerivedStateForPressure(storage);
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

  public async requestPersistence(): Promise<"GRANTED" | "DENIED" | "UNAVAILABLE"> {
    this.persistence = await this.requestPersistentStorage();
    return this.persistence;
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
    const packageStates = await this.listPackageStates();
    const automationRules = await this.getAutomationRules();
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
      ...(packageStates.length > 0 ? { packageStates } : {}),
      ...(automationRules.length > 0 ? { automationRules } : {}),
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

    const existingSettings = await requestResult(this.requireDatabase().transaction(SETTINGS_STORE, "readonly").objectStore(SETTINGS_STORE).getAll());
    const packageSettingIds = existingSettings
      .filter((setting) => typeof setting?.id === "string" && setting.id.startsWith(PACKAGE_STATE_PREFIX))
      .map((setting) => setting.id as string);
    const packageStates: VaultPackageState[] = [];
    const packageIds = new Set<string>();
    let skippedPackageStates = 0;
    for (const candidate of snapshot.packageStates ?? []) {
      if (!isVaultPackageState(candidate) || packageIds.has(candidate.packageId)) {
        skippedPackageStates += 1;
        continue;
      }
      packageIds.add(candidate.packageId);
      packageStates.push(structuredClone(candidate));
    }

    const automationRules: VaultPackageAutomation[] = [];
    const automationRuleIds = new Set<string>();
    let skippedAutomationRules = 0;
    for (const candidate of snapshot.automationRules ?? []) {
      if (!isVaultPackageAutomation(candidate) || automationRuleIds.has(candidate.ruleId) || automationRules.length >= MAX_VAULT_AUTOMATION_RULES) {
        skippedAutomationRules += 1;
        continue;
      }
      automationRuleIds.add(candidate.ruleId);
      automationRules.push(structuredClone(candidate));
    }

    const transaction = this.requireDatabase().transaction([RECORD_STORE, SEARCH_STORE, SEARCH_META_STORE, HISTORY_STORE, ARTIFACT_STORE, SETTINGS_STORE], "readwrite");
    transaction.objectStore(RECORD_STORE).clear();
    transaction.objectStore(SEARCH_STORE).clear();
    transaction.objectStore(SEARCH_META_STORE).put({ id: "default", version: SEARCH_INDEX_VERSION, valid: false, invalidReason: "RECOVERY_REPAIR" } satisfies SearchIndexMeta);
    transaction.objectStore(HISTORY_STORE).clear();
    transaction.objectStore(ARTIFACT_STORE).clear();
    const settingsStore = transaction.objectStore(SETTINGS_STORE);
    packageSettingIds.forEach((id) => settingsStore.delete(id));
    settingsStore.delete(AUTOMATION_RULES_SETTING_ID);
    records.forEach((record) => transaction.objectStore(RECORD_STORE).put(record));
    history.forEach((entry) => transaction.objectStore(HISTORY_STORE).put(entry));
    artifacts.forEach((artifact) => transaction.objectStore(ARTIFACT_STORE).put(artifact));
    packageStates.forEach((state) => settingsStore.put({ id: packageStateSettingId(state.packageId), value: state, modifiedAt: new Date().toISOString() }));
    if (automationRules.length > 0) settingsStore.put({ id: AUTOMATION_RULES_SETTING_ID, value: automationRules, modifiedAt: new Date().toISOString() });
    await transactionDone(transaction);

    return {
      retainedRecords: records.length,
      removedRecords: snapshot.records.length - records.length,
      retainedHistory: history.length,
      removedHistory: snapshot.history.length - history.length,
      retainedArtifactPayloads: artifacts.length,
      skippedArtifactPayloads,
      retainedPackageStates: packageStates.length,
      skippedPackageStates,
      retainedAutomationRules: automationRules.length,
      skippedAutomationRules
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
    const packageStates = await this.listPackageStates();
    const automationRules = await this.getAutomationRules();
    return {
      format: "OMNEVUM_RECOVERY_SNAPSHOT",
      version: 1,
      exportedAt: new Date().toISOString(),
      records,
      history,
      artifacts,
      ...(packageStates.length > 0 ? { packageStates } : {}),
      ...(automationRules.length > 0 ? { automationRules } : {}),
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
    return { recordCount: vault.records.length, historyEntries: vault.history?.length ?? 0, artifactPayloads: vault.artifacts?.length ?? 0, imported, skipped, conflicts, hasPresentation: vault.presentation !== undefined, packageStates: vault.packageStates?.length ?? 0, automationRules: vault.automationRules?.length ?? 0 };
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
    for (const state of vault.packageStates ?? []) {
      settingsStore.put({ id: packageStateSettingId(state.packageId), value: structuredClone(state), modifiedAt: new Date().toISOString() });
    }
    if (vault.automationRules && vault.automationRules.length > 0) settingsStore.put({ id: AUTOMATION_RULES_SETTING_ID, value: structuredClone(vault.automationRules), modifiedAt: new Date().toISOString() });
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
    const storage = await this.readStorageHealth();
    if (storage?.pressure === "ELEVATED") {
      this.pressureEpisode = "ELEVATED";
      this.pressureReclaimed = true;
    }
  }

  public async reclaimDerivedState(): Promise<boolean> {
    const transaction = this.requireDatabase().transaction([SEARCH_STORE, SEARCH_META_STORE], "readwrite");
    transaction.objectStore(SEARCH_STORE).clear();
    transaction.objectStore(SEARCH_META_STORE).put({ id: "default", version: SEARCH_INDEX_VERSION, valid: false, invalidReason: "PRESSURE_RECLAIM" } satisfies SearchIndexMeta);
    await transactionDone(transaction);
    this.pressureReclaimed = true;
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

  private openChangeChannel(): void {
    if (typeof globalThis.BroadcastChannel !== "function") return;
    try {
      const channel = new globalThis.BroadcastChannel(`${this.databaseName}:changes`);
      channel.onmessage = (event: MessageEvent<unknown>) => {
        const change = parseCanonicalStoreChange(event.data);
        if (!change) return;
        for (const listener of this.changeListeners) listener(change);
      };
      this.changeChannel = channel;
    } catch {
      // Cross-tab invalidation is optional; canonical persistence remains authoritative.
      this.changeChannel = null;
    }
  }

  private publishChange(change: CanonicalStoreChange): void {
    try {
      this.changeChannel?.postMessage(change);
    } catch {
      // Cross-tab invalidation is optional; canonical persistence remains authoritative.
    }
  }

  private requireDatabase(): IDBDatabase {
    if (!this.database) throw new Error("CanonicalStore is not open");
    return this.database;
  }

  private async reclaimDerivedStateUnderPressure(): Promise<void> {
    const storage = await this.readStorageHealth();
    await this.reclaimDerivedStateForPressure(storage);
  }

  private async reclaimDerivedStateForPressure(storage: Omit<NonNullable<StoreHealth["storage"]>, "reclaimedDerivedState"> | undefined): Promise<boolean> {
    const pressure = storage?.pressure ?? "UNKNOWN";
    if (pressure !== this.pressureEpisode) {
      this.pressureEpisode = pressure;
      this.pressureReclaimed = false;
    }
    if (pressure !== "ELEVATED" || this.pressureReclaimed) return false;
    await this.reclaimDerivedState();
    return true;
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

function isRetirementAuthorization(value: unknown): value is RetirementAuthorization {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as { kind?: unknown; recordedAt?: unknown; vaultFingerprint?: unknown; recordCount?: unknown; sizeBytes?: unknown };
  if ((candidate.kind !== "VERIFIED_VAULT_EXPORT" && candidate.kind !== "EXPLICIT_DESTROY_INTENT") || typeof candidate.recordedAt !== "string") return false;
  if (candidate.kind === "EXPLICIT_DESTROY_INTENT") return true;
  const recordCount = candidate.recordCount;
  const sizeBytes = candidate.sizeBytes;
  return typeof candidate.vaultFingerprint === "string" && candidate.vaultFingerprint.length === 64 && typeof recordCount === "number" && Number.isSafeInteger(recordCount) && recordCount >= 0 && typeof sizeBytes === "number" && Number.isSafeInteger(sizeBytes) && sizeBytes > 0;
}

function isVerifiedBackup(value: unknown): value is VerifiedBackup & { sizeBytes: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<VerifiedBackup> & { sizeBytes?: unknown };
  const recordCount = candidate.recordCount;
  const artifactCount = candidate.artifactCount;
  const sizeBytes = candidate.sizeBytes;
  return typeof candidate.verifiedAt === "string"
    && Number.isFinite(Date.parse(candidate.verifiedAt))
    && typeof candidate.digest === "string"
    && /^[a-f0-9]{64}$/iu.test(candidate.digest)
    && typeof recordCount === "number"
    && Number.isSafeInteger(recordCount)
    && recordCount >= 0
    && typeof artifactCount === "number"
    && Number.isSafeInteger(artifactCount)
    && artifactCount >= 0
    && typeof sizeBytes === "number"
    && Number.isSafeInteger(sizeBytes)
    && sizeBytes > 0;
}

function rawArtifactMimeType(candidate: { data?: unknown }, blob: Blob): string {
  const data = candidate.data;
  const mimeType = data && typeof data === "object" && !Array.isArray(data) ? (data as { mimeType?: unknown }).mimeType : undefined;
  return typeof mimeType === "string" && mimeType.length > 0 && mimeType.length <= 255 ? mimeType : blob.type || "application/octet-stream";
}

function isRecoverySnapshot(value: unknown): value is RecoverySnapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as { format?: unknown; version?: unknown; records?: unknown; history?: unknown; artifacts?: unknown; packageStates?: unknown; automationRules?: unknown };
  return candidate.format === "OMNEVUM_RECOVERY_SNAPSHOT"
    && candidate.version === 1
    && Array.isArray(candidate.records)
    && Array.isArray(candidate.history)
    && Array.isArray(candidate.artifacts)
    && (candidate.packageStates === undefined || (Array.isArray(candidate.packageStates) && candidate.packageStates.length <= MAX_VAULT_PACKAGE_STATES))
    && (candidate.automationRules === undefined || (Array.isArray(candidate.automationRules) && candidate.automationRules.length <= MAX_VAULT_AUTOMATION_RULES));
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

function packageStateSettingId(packageId: string): string {
  return `${PACKAGE_STATE_PREFIX}${packageId}`;
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
