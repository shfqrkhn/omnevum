import type { CanonicalRecord, HistoryEntry, VaultDocument } from "./model";
import { CURRENT_SCHEMA_VERSION, VAULT_FORMAT_VERSION } from "./model";

const recordTypes = new Set(["note", "task", "observation"]);
const truthClasses = new Set([
  "USER_OBSERVATION",
  "IMPORTED_RECORD",
  "SOURCE_CLAIM",
  "ASSUMPTION",
  "ESTIMATE",
  "DERIVED",
  "AI_HYPOTHESIS",
  "UNKNOWN"
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isCanonicalRecord(value: unknown): value is CanonicalRecord {
  if (!isObject(value)) return false;
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.owner === "string" &&
    value.owner.length > 0 &&
    typeof value.recordType === "string" &&
    recordTypes.has(value.recordType) &&
    value.schemaVersion === CURRENT_SCHEMA_VERSION &&
    typeof value.createdAt === "string" &&
    typeof value.modifiedAt === "string" &&
    isObject(value.provenance) &&
    (value.provenance.source === "USER_INPUT" || value.provenance.source === "IMPORT") &&
    typeof value.provenance.capturedAt === "string" &&
    typeof value.truthClass === "string" &&
    truthClasses.has(value.truthClass) &&
    (value.sensitivity === "PRIVATE" || value.sensitivity === "SHARED") &&
    typeof value.revision === "number" &&
    Number.isInteger(value.revision) &&
    value.revision >= 1 &&
    typeof value.deleted === "boolean" &&
    isObject(value.data)
  );
}

export function assertCanonicalRecord(value: unknown): asserts value is CanonicalRecord {
  if (!isCanonicalRecord(value)) throw new Error("Invalid canonical record");
}

export function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (!isObject(value)) return false;
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.recordId === "string" &&
    value.recordId.length > 0 &&
    typeof value.revision === "number" &&
    Number.isInteger(value.revision) &&
    value.revision >= 1 &&
    typeof value.recordedAt === "string" &&
    isCanonicalRecord(value.record) &&
    value.record.id === value.recordId &&
    value.record.revision === value.revision
  );
}

export function isVaultDocument(value: unknown): value is VaultDocument {
  if (!isObject(value) || value.format !== "OMNEVUM_VAULT" || value.version !== VAULT_FORMAT_VERSION) return false;
  return typeof value.exportedAt === "string" && Array.isArray(value.records) && value.records.every(isCanonicalRecord) && (value.history === undefined || (Array.isArray(value.history) && value.history.every(isHistoryEntry)));
}

export function assertVaultDocument(value: unknown): asserts value is VaultDocument {
  if (!isVaultDocument(value)) throw new Error("Invalid Omnevum Vault document");
}
