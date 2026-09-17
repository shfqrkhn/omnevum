import type { CanonicalRecord } from "./model";

export const SEARCH_INDEX_VERSION = 1 as const;

export interface SearchDocument {
  id: string;
  terms: string;
  modifiedAt: string;
}

export interface SearchIndexMeta {
  id: "default";
  version: typeof SEARCH_INDEX_VERSION;
  valid: boolean;
  rebuiltAt?: string;
}

function values(value: unknown): string[] {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(values);
  if (typeof value === "object" && value !== null) return Object.values(value).flatMap(values);
  return [];
}

export function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function makeSearchDocument(record: CanonicalRecord): SearchDocument {
  return { id: record.id, terms: normalizeSearchText(values(record.data).join(" ")), modifiedAt: record.modifiedAt };
}

export function searchDocuments(documents: SearchDocument[], query: string): SearchDocument[] {
  const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  return documents
    .filter((document) => terms.every((term) => document.terms.includes(term)))
    .sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
}

export function isSearchDocument(value: unknown): value is SearchDocument {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string" && candidate.id.length > 0 && typeof candidate.terms === "string" && typeof candidate.modifiedAt === "string";
}
