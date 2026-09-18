import type { CanonicalRecord } from "./model";
import MiniSearch from "minisearch";

export const SEARCH_INDEX_VERSION = 2 as const;

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
  invalidReason?: "MISSING" | "MALFORMED" | "STALE" | "CANONICAL_INVALID" | "PRESSURE_RECLAIM" | "RECOVERY_REPAIR";
}

function values(value: unknown): string[] {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(values);
  if (typeof value === "object" && value !== null) return Object.values(value).flatMap(values);
  return [];
}

export function normalizeSearchText(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function makeSearchDocument(record: CanonicalRecord): SearchDocument {
  return { id: record.id, terms: normalizeSearchText(values(record.data).join(" ")), modifiedAt: record.modifiedAt };
}

export function searchDocuments(documents: SearchDocument[], query: string): SearchDocument[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [...documents].sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
  const index = new MiniSearch<SearchDocument>({
    fields: ["terms"],
    storeFields: ["modifiedAt"],
    tokenize: (value) => normalizeSearchText(value).split(/\s+/).filter(Boolean),
    processTerm: (term) => normalizeSearchText(term)
  });
  index.addAll(documents);
  const byId = new Map(documents.map((document) => [document.id, document]));
  return index.search(normalizedQuery, { prefix: true, fuzzy: 0.2, combineWith: "AND" })
    .map((result) => byId.get(String(result.id)))
    .filter((document): document is SearchDocument => document !== undefined);
}

export function isSearchDocument(value: unknown): value is SearchDocument {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string" && candidate.id.length > 0 && candidate.id.length <= 160 && typeof candidate.terms === "string" && candidate.terms.length <= 1_000_000 && typeof candidate.modifiedAt === "string";
}
