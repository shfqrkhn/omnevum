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

export function isVaultArtifact(value: unknown): value is VaultArtifact {
  if (!isObject(value)) return false;
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
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
  if (typeof value.exportedAt !== "string" || !Array.isArray(value.records) || !value.records.every(isCanonicalRecord)) return false;
  const records = value.records as CanonicalRecord[];
  if (new Set(records.map((record) => record.id)).size !== records.length) return false;
  if (
    value.history !== undefined &&
    (!Array.isArray(value.history) ||
      !value.history.every(isHistoryEntry) ||
      new Set(value.history.map((entry) => entry.id)).size !== value.history.length ||
      new Set(value.history.map((entry) => `${entry.recordId}:${entry.revision}`)).size !== value.history.length ||
      !value.history.every((entry) => records.some((record) => record.id === entry.recordId)))
  ) return false;
  if (value.artifacts !== undefined && (!Array.isArray(value.artifacts) || !value.artifacts.every(isVaultArtifact) || new Set(value.artifacts.map((artifact) => artifact.id)).size !== value.artifacts.length)) return false;
  const artifactRecordIds = new Set(records.filter((record) => record.recordType === "artifact").map((record) => record.id));
  const artifactIds = new Set((value.artifacts ?? []).map((artifact) => artifact.id));
  return artifactRecordIds.size === artifactIds.size && [...artifactRecordIds].every((id) => artifactIds.has(id)) && [...artifactIds].every((id) => artifactRecordIds.has(id));
}

export function assertVaultDocument(value: unknown): asserts value is VaultDocument {
  if (!isVaultDocument(value)) throw new Error("Invalid Omnevum Vault document");
}
