import type { CanonicalRecord } from "./model";
import MiniSearch from "minisearch";
import { lensIdsForRecord } from "./lenses";
import type { PresentationLensId } from "./presentation";
import type { SpaceId } from "./domain";
import type { RecordType } from "./model";

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

export interface SearchFacetState {
  lens?: PresentationLensId;
  recordType?: RecordType;
  space?: SpaceId;
  hasArtifact?: boolean;
}

export interface ParsedSearchQuery {
  text: string;
  facets: SearchFacetState;
}

const SEARCH_LENSES: readonly PresentationLensId[] = ["direction", "people", "self", "resources", "work", "environment", "knowledge", "change"];
const SEARCH_RECORD_TYPES: readonly RecordType[] = ["note", "task", "observation", "relationship", "artifact"];
const SEARCH_SPACES: readonly SpaceId[] = ["personal", "household", "work"];

function values(value: unknown): string[] {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(values);
  if (typeof value === "object" && value !== null) return Object.values(value).flatMap(values);
  return [];
}

export function normalizeSearchText(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function parseSearchQuery(query: string): ParsedSearchQuery {
  const facets: SearchFacetState = {};
  const text = query.replace(/(?:^|\s)(lens|type|space|has):([^\s]+)/gi, (token, key: string, value: string) => {
    const normalizedKey = key.toLowerCase();
    const normalizedValue = value.toLowerCase();
    if (normalizedKey === "lens" && SEARCH_LENSES.includes(normalizedValue as PresentationLensId)) facets.lens = normalizedValue as PresentationLensId;
    else if (normalizedKey === "type" && SEARCH_RECORD_TYPES.includes(normalizedValue as RecordType)) facets.recordType = normalizedValue as RecordType;
    else if (normalizedKey === "space" && SEARCH_SPACES.includes(normalizedValue as SpaceId)) facets.space = normalizedValue as SpaceId;
    else if (normalizedKey === "has" && normalizedValue === "artifact") facets.hasArtifact = true;
    else return token;
    return " ";
  }).replace(/\s+/g, " ").trim();
  return { text, facets };
}

export function serializeSearchQuery(query: ParsedSearchQuery): string {
  const tokens = [
    query.facets.lens ? `lens:${query.facets.lens}` : "",
    query.facets.recordType ? `type:${query.facets.recordType}` : "",
    query.facets.space ? `space:${query.facets.space}` : "",
    query.facets.hasArtifact ? "has:artifact" : ""
  ].filter(Boolean);
  return [query.text.trim(), ...tokens].filter(Boolean).join(" ");
}

export function matchesSearchFacets(record: CanonicalRecord, facets: SearchFacetState): boolean {
  if (facets.lens && !lensIdsForRecord(record).includes(facets.lens)) return false;
  if (facets.recordType && record.recordType !== facets.recordType) return false;
  if (facets.space && record.data.space !== facets.space) return false;
  if (facets.hasArtifact && record.recordType !== "artifact" && typeof record.data.sourceArtifactId !== "string") return false;
  return true;
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
