import type { CanonicalRecord, HistoryEntry, VaultDocument } from "./model";
import { VAULT_FORMAT_VERSION } from "./model";
import { isSearchDocument, makeSearchDocument, SEARCH_INDEX_VERSION, searchDocuments, type SearchDocument, type SearchIndexMeta } from "./search";
import { assertCanonicalRecord, assertVaultDocument, isHistoryEntry } from "./validation";

const RECORD_STORE = "records";
const SEARCH_STORE = "searchDocuments";
const SEARCH_META_STORE = "searchMeta";
const HISTORY_STORE = "history";
const SETTINGS_STORE = "settings";

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

    const request = indexedDB.open(this.databaseName, 4);
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

  public async put(record: CanonicalRecord): Promise<void> {
    assertCanonicalRecord(record);
    const transaction = this.requireDatabase().transaction([RECORD_STORE, SEARCH_META_STORE, HISTORY_STORE], "readwrite");
    transaction.objectStore(RECORD_STORE).put(record);
    transaction.objectStore(SEARCH_META_STORE).put({ id: "default", version: SEARCH_INDEX_VERSION, valid: false } satisfies SearchIndexMeta);
    transaction.objectStore(HISTORY_STORE).put({ id: `${record.id}:${record.revision}`, recordId: record.id, revision: record.revision, recordedAt: new Date().toISOString(), record } satisfies HistoryEntry);
    await transactionDone(transaction);
  }

  public async clear(): Promise<void> {
    const transaction = this.requireDatabase().transaction([RECORD_STORE, SEARCH_STORE, SEARCH_META_STORE, HISTORY_STORE], "readwrite");
    transaction.objectStore(RECORD_STORE).clear();
    transaction.objectStore(SEARCH_STORE).clear();
    transaction.objectStore(SEARCH_META_STORE).put({ id: "default", version: SEARCH_INDEX_VERSION, valid: true, rebuiltAt: new Date().toISOString() } satisfies SearchIndexMeta);
    transaction.objectStore(HISTORY_STORE).clear();
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

  public async invalidateSearchIndex(): Promise<void> {
    const transaction = this.requireDatabase().transaction(SEARCH_META_STORE, "readwrite");
    transaction.objectStore(SEARCH_META_STORE).put({ id: "default", version: SEARCH_INDEX_VERSION, valid: false } satisfies SearchIndexMeta);
    await transactionDone(transaction);
  }

  public async exportVault(): Promise<VaultDocument> {
    return {
      format: "OMNEVUM_VAULT",
      version: VAULT_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      records: await this.list(true),
      history: await this.history()
    };
  }

  public async importVault(input: unknown): Promise<{ imported: number; skipped: number }> {
    assertVaultDocument(input);
    const existing = new Map((await this.list(true)).map((record) => [record.id, record]));
    const transaction = this.requireDatabase().transaction([RECORD_STORE, SEARCH_META_STORE, HISTORY_STORE], "readwrite");
    const objectStore = transaction.objectStore(RECORD_STORE);
    const searchMetaStore = transaction.objectStore(SEARCH_META_STORE);
    const historyStore = transaction.objectStore(HISTORY_STORE);
    let imported = 0;
    let skipped = 0;

    for (const record of input.records) {
      const current = existing.get(record.id);
      if (!current || record.revision >= current.revision) {
        objectStore.put(record);
        imported += 1;
      } else {
        skipped += 1;
      }
    }

    for (const entry of input.history ?? []) historyStore.put(entry);
    searchMetaStore.put({ id: "default", version: SEARCH_INDEX_VERSION, valid: false } satisfies SearchIndexMeta);
    await transactionDone(transaction);
    return { imported, skipped };
  }

  private searchRebuild: Promise<void> | null = null;

  private async ensureSearchIndex(): Promise<void> {
    const health = await this.getSearchHealth();
    if (health.valid) return;
    if (!this.searchRebuild) {
      this.searchRebuild = this.rebuildSearchIndex().finally(() => {
        this.searchRebuild = null;
      });
    }
    await this.searchRebuild;
  }

  private async rebuildSearchIndex(): Promise<void> {
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
