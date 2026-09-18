import type { CanonicalRecord } from "./model";

export const DATASET_FORMAT = "OMNEVUM_DERIVED_DATASET" as const;
export const MAX_DATASET_ROWS = 10_000;
export const MAX_DATASET_COLUMNS = 50;

export interface DataColumn {
  id: string;
  label: string;
}

export interface DerivedDataset {
  format: typeof DATASET_FORMAT;
  version: 1;
  truthClass: "DERIVED";
  sourceIds: string[];
  columns: DataColumn[];
  rows: Array<Record<string, unknown>>;
  limitations: string[];
}

export function projectDataset(records: CanonicalRecord[], fields: string[]): DerivedDataset {
  const safeFields = fields.filter((field) => isSafePath(field)).slice(0, MAX_DATASET_COLUMNS);
  if (safeFields.length === 0) throw new Error("A dataset requires at least one safe field");
  const selected = records.filter((record) => !record.deleted).slice(0, MAX_DATASET_ROWS);
  return {
    format: DATASET_FORMAT,
    version: 1,
    truthClass: "DERIVED",
    sourceIds: selected.map((record) => record.id),
    columns: safeFields.map((field) => ({ id: field, label: field })),
    rows: selected.map((record) => Object.fromEntries(safeFields.map((field) => [field, readPath(record, field)]))),
    limitations: records.length > MAX_DATASET_ROWS ? [`Rows limited to ${MAX_DATASET_ROWS}.`] : []
  };
}

export function readPath(value: unknown, path: string): unknown {
  if (!isSafePath(path)) return undefined;
  let current: unknown = value;
  for (const part of path.split(".")) {
    if (typeof current !== "object" || current === null || !Object.prototype.hasOwnProperty.call(current, part)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function isSafePath(path: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_.-]{0,200}$/.test(path) && !path.split(".").some((part) => part === "__proto__" || part === "prototype" || part === "constructor");
}
