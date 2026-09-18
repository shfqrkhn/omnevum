import type { CanonicalRecord, HistoryEntry, VaultArtifact, VaultDocument } from "./model";
import { CURRENT_SCHEMA_VERSION, VAULT_FORMAT_VERSION } from "./model";

const recordTypes = new Set(["note", "task", "observation", "relationship", "artifact"]);
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
const MAX_VAULT_ARTIFACT_BYTES = 10 * 1024 * 1024;
const MAX_VAULT_ARTIFACT_BASE64_LENGTH = Math.ceil(MAX_VAULT_ARTIFACT_BYTES / 3) * 4;

export const MAX_CANONICAL_ID_LENGTH = 160;
export const MAX_CANONICAL_OWNER_LENGTH = 160;
export const MAX_CANONICAL_DATA_KEYS = 200;
export const MAX_VAULT_RECORDS = 50_000;
export const MAX_VAULT_HISTORY_ENTRIES = 100_000;
export const MAX_VAULT_ARTIFACT_TOTAL_BYTES = 50 * 1024 * 1024;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_CANONICAL_ID_LENGTH && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
}

function isBoundedReference(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 500 && !/[\u0000\r\n]/.test(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 100 && Number.isFinite(Date.parse(value));
}

function isBoundedData(value: Record<string, unknown>, depth = 0): boolean {
  if (depth > 16 || Object.keys(value).length > MAX_CANONICAL_DATA_KEYS) return false;
  return Object.entries(value).every(([key, child]) => {
    if (!key || key.length > 160) return false;
    if (typeof child === "string") return child.length <= 100_000;
    if (Array.isArray(child)) return child.length <= 500 && child.every((item) => item === null || typeof item !== "object" ? true : isObject(item) && isBoundedData(item, depth + 1));
    return child !== null && typeof child === "object" ? isObject(child) && isBoundedData(child, depth + 1) : true;
  });
}

export function isCanonicalRecord(value: unknown): value is CanonicalRecord {
  if (!isObject(value)) return false;
  return (
    isBoundedId(value.id) &&
    typeof value.owner === "string" &&
    value.owner.length > 0 &&
    value.owner.length <= MAX_CANONICAL_OWNER_LENGTH &&
    typeof value.recordType === "string" &&
    recordTypes.has(value.recordType) &&
    value.schemaVersion === CURRENT_SCHEMA_VERSION &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.modifiedAt) &&
    (value.effectiveAt === undefined || isTimestamp(value.effectiveAt)) &&
    (value.subjectId === undefined || isBoundedReference(value.subjectId)) &&
    isObject(value.provenance) &&
    (value.provenance.source === "USER_INPUT" || value.provenance.source === "IMPORT") &&
    isTimestamp(value.provenance.capturedAt) &&
    (value.provenance.sourceId === undefined || isBoundedReference(value.provenance.sourceId)) &&
    typeof value.truthClass === "string" &&
    truthClasses.has(value.truthClass) &&
    (value.sensitivity === "PRIVATE" || value.sensitivity === "SHARED") &&
    typeof value.revision === "number" &&
    Number.isInteger(value.revision) &&
    value.revision >= 1 &&
    typeof value.deleted === "boolean" &&
    isObject(value.data) &&
    isBoundedData(value.data)
  );
}

export function assertCanonicalRecord(value: unknown): asserts value is CanonicalRecord {
  if (!isCanonicalRecord(value)) throw new Error("Invalid canonical record");
}

export function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (!isObject(value)) return false;
  return (
    isBoundedId(value.id) &&
    isBoundedId(value.recordId) &&
    typeof value.revision === "number" &&
    Number.isInteger(value.revision) &&
    value.revision >= 1 &&
    isTimestamp(value.recordedAt) &&
    isCanonicalRecord(value.record) &&
    value.record.id === value.recordId &&
    value.record.revision === value.revision
  );
}

export function isVaultArtifact(value: unknown): value is VaultArtifact {
  if (!isObject(value)) return false;
  return (
    isBoundedId(value.id) &&
    typeof value.mimeType === "string" &&
    value.mimeType.length > 0 &&
    value.mimeType.length <= 255 &&
    typeof value.dataBase64 === "string" &&
    value.dataBase64.length <= MAX_VAULT_ARTIFACT_BASE64_LENGTH &&
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.dataBase64)
  );
}

export function isVaultDocument(value: unknown): value is VaultDocument {
  if (!isObject(value) || value.format !== "OMNEVUM_VAULT" || value.version !== VAULT_FORMAT_VERSION) return false;
  if (!isTimestamp(value.exportedAt) || !Array.isArray(value.records) || value.records.length > MAX_VAULT_RECORDS || !value.records.every(isCanonicalRecord)) return false;
  if (value.presentation !== undefined && !isObject(value.presentation)) return false;
  if (value.integrity !== undefined && (!isObject(value.integrity) || value.integrity.algorithm !== "SHA-256" || typeof value.integrity.digest !== "string" || !/^[a-f0-9]{64}$/i.test(value.integrity.digest))) return false;
  const records = value.records as CanonicalRecord[];
  if (new Set(records.map((record) => record.id)).size !== records.length) return false;
  if (
    value.history !== undefined &&
    (!Array.isArray(value.history) ||
      value.history.length > MAX_VAULT_HISTORY_ENTRIES ||
      !value.history.every(isHistoryEntry) ||
      new Set(value.history.map((entry) => entry.id)).size !== value.history.length ||
      new Set(value.history.map((entry) => `${entry.recordId}:${entry.revision}`)).size !== value.history.length ||
      !value.history.every((entry) => records.some((record) => record.id === entry.recordId)))
  ) return false;
  if (value.artifacts !== undefined && (!Array.isArray(value.artifacts) || !value.artifacts.every(isVaultArtifact) || new Set(value.artifacts.map((artifact) => artifact.id)).size !== value.artifacts.length)) return false;
  const artifactRecordIds = new Set(records.filter((record) => record.recordType === "artifact").map((record) => record.id));
  const artifactIds = new Set((value.artifacts ?? []).map((artifact) => artifact.id));
  const estimatedArtifactBytes = (value.artifacts ?? []).reduce((total, artifact) => total + Math.floor(artifact.dataBase64.length * 3 / 4), 0);
  if (estimatedArtifactBytes > MAX_VAULT_ARTIFACT_TOTAL_BYTES) return false;
  return artifactRecordIds.size === artifactIds.size && [...artifactRecordIds].every((id) => artifactIds.has(id)) && [...artifactIds].every((id) => artifactRecordIds.has(id));
}

export function assertVaultDocument(value: unknown): asserts value is VaultDocument {
  if (!isVaultDocument(value)) throw new Error("Invalid Omnevum Vault document");
}
