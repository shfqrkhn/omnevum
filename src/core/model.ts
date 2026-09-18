export const CURRENT_SCHEMA_VERSION = 1 as const;
export const VAULT_FORMAT_VERSION = 1 as const;

export type RecordType = "note" | "task" | "observation" | "relationship" | "artifact";

export const CAPTURE_KINDS = [
  "note",
  "task",
  "observation",
  "expense",
  "measurement",
  "workout",
  "event",
  "person",
  "goal",
  "decision",
  "url",
  "voice",
  "file",
  "image",
  "source"
] as const;
export type CaptureKind = (typeof CAPTURE_KINDS)[number];

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
  effectiveAt?: string;
  subjectId?: string;
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

export interface VaultArtifact {
  id: string;
  mimeType: string;
  dataBase64: string;
}

export interface VaultPackageState {
  packageId: string;
  schemaVersion: number;
  state: Record<string, unknown>;
}

export type VaultPackageAutomationStatus = "ENABLED" | "DISABLED";

export interface VaultPackageAutomation {
  schemaVersion: 1;
  packageId: string;
  ruleId: string;
  ruleVersion: number;
  document: string;
  status: VaultPackageAutomationStatus;
  installedAt: string;
  disabledReason?: string;
}

export interface VaultDocument {
  format: "OMNEVUM_VAULT";
  version: typeof VAULT_FORMAT_VERSION;
  exportedAt: string;
  records: CanonicalRecord[];
  history?: HistoryEntry[];
  artifacts?: VaultArtifact[];
  packageStates?: VaultPackageState[];
  automationRules?: VaultPackageAutomation[];
  integrity?: { algorithm: "SHA-256"; digest: string };
  presentation?: Record<string, unknown>;
}
