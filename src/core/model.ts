export const CURRENT_SCHEMA_VERSION = 1 as const;
export const VAULT_FORMAT_VERSION = 1 as const;

export type RecordType = "note" | "task" | "observation";

export type TruthClass =
  | "USER_OBSERVATION"
  | "IMPORTED_RECORD"
  | "SOURCE_CLAIM"
  | "ASSUMPTION"
  | "ESTIMATE"
  | "DERIVED"
  | "AI_HYPOTHESIS"
  | "UNKNOWN";

export interface RecordProvenance {
  source: "USER_INPUT" | "IMPORT";
  capturedAt: string;
  sourceId?: string;
}

export interface CanonicalRecord {
  id: string;
  recordType: RecordType;
  owner: string;
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  createdAt: string;
  modifiedAt: string;
  provenance: RecordProvenance;
  truthClass: TruthClass;
  sensitivity: "PRIVATE" | "SHARED";
  revision: number;
  deleted: boolean;
  data: Record<string, unknown>;
}

export interface HistoryEntry {
  id: string;
  recordId: string;
  revision: number;
  recordedAt: string;
  record: CanonicalRecord;
}

export interface VaultDocument {
  format: "OMNEVUM_VAULT";
  version: typeof VAULT_FORMAT_VERSION;
  exportedAt: string;
  records: CanonicalRecord[];
  history?: HistoryEntry[];
}
