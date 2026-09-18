import type { CanonicalRecord } from "./model";
import { readPath } from "./data";

export interface DerivedAnalysis {
  kind: "DERIVED_ANALYSIS";
  operation: "COUNT" | "SUM" | "AVERAGE" | "GROUP_COUNT";
  sourceIds: string[];
  value: number | Record<string, number>;
  limitations: string[];
}

export function countRecords(records: CanonicalRecord[]): DerivedAnalysis {
  const selected = active(records);
  return { kind: "DERIVED_ANALYSIS", operation: "COUNT", sourceIds: selected.map((record) => record.id), value: selected.length, limitations: ["Count is descriptive and does not establish causation."] };
}

export function summarizeNumbers(records: CanonicalRecord[], field: string): DerivedAnalysis {
  const selected = active(records);
  const values = selected.map((record) => readPath(record, field)).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const sum = values.reduce((total, value) => total + value, 0);
  return { kind: "DERIVED_ANALYSIS", operation: values.length > 0 ? "AVERAGE" : "SUM", sourceIds: selected.map((record) => record.id), value: values.length > 0 ? sum / values.length : 0, limitations: [`${values.length} numeric value(s) matched ${field}; missing values were excluded.`, "Descriptive movement does not establish causation."] };
}

export function groupCounts(records: CanonicalRecord[], field: string): DerivedAnalysis {
  const counts: Record<string, number> = {};
  const selected = active(records);
  for (const record of selected) {
    const value = readPath(record, field);
    const key = typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : "(missing)";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return { kind: "DERIVED_ANALYSIS", operation: "GROUP_COUNT", sourceIds: selected.map((record) => record.id), value: counts, limitations: ["Groups are descriptive; they do not imply a causal or diagnostic relationship."] };
}

function active(records: CanonicalRecord[]): CanonicalRecord[] {
  return records.filter((record) => !record.deleted);
}
