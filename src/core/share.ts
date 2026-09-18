import type { CanonicalRecord, RecordProvenance } from "./model";
import { scrubSensitiveValue } from "./safety";

export interface ShareProjection {
  format: "OMNEVUM_SHARE_PROJECTION";
  version: 1;
  exportedAt: string;
  records: CanonicalRecord[];
  omittedRecordCount: number;
}

export function projectForShare(records: CanonicalRecord[], selectedIds: Iterable<string>, includePrivate = false): ShareProjection {
  const selected = new Set(selectedIds);
  const selectedRecords = records.filter((record) => selected.has(record.id) && (includePrivate || record.sensitivity === "SHARED"));
  const selectedRecordIds = new Set(selectedRecords.map((record) => record.id));
  const projected = selectedRecords.map((record) => {
    const data = scrubValue(record.data, selectedRecordIds) as Record<string, unknown>;
    const provenance: RecordProvenance = { source: record.provenance.source, capturedAt: record.provenance.capturedAt };
    return { ...record, sensitivity: "SHARED" as const, provenance, data };
  });
  return { format: "OMNEVUM_SHARE_PROJECTION", version: 1, exportedAt: new Date().toISOString(), records: projected, omittedRecordCount: records.filter((record) => selected.has(record.id)).length - projected.length };
}

export function parseShareProjection(value: unknown): ShareProjection {
  if (typeof value !== "object" || value === null) throw new Error("Invalid share projection");
  const candidate = value as Record<string, unknown>;
  if (candidate.format !== "OMNEVUM_SHARE_PROJECTION" || candidate.version !== 1 || !Array.isArray(candidate.records)) throw new Error("Invalid share projection");
  return value as ShareProjection;
}

function scrubValue(value: unknown, selectedRecordIds: Set<string>, key = ""): unknown {
  if (scrubSensitiveValue(value, key) === undefined) return undefined;
  if (key === "blobRef" && typeof value === "string" && !selectedRecordIds.has(value)) return undefined;
  if (/(?:^|_)(?:linked|source|target|subject|record)Id$/i.test(key) && typeof value === "string" && !selectedRecordIds.has(value)) return undefined;
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, selectedRecordIds)).filter((item) => item !== undefined);
  if (typeof value === "object" && value !== null) return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([childKey, child]) => [childKey, scrubValue(child, selectedRecordIds, childKey)]).filter(([, child]) => child !== undefined));
  return value;
}
