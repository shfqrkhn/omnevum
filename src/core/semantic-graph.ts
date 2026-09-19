import type { AcquireCandidate } from "./acquire";
import type { CanonicalRecord } from "./model";

export const SEMANTIC_GRAPH_VERSION = 1 as const;
const GRAPH_ID = /^[A-Za-z0-9][A-Za-z0-9._:/#?&=%-]{0,240}$/u;

export interface SemanticTerm {
  kind: "IRI" | "LITERAL";
  value: string;
  datatype?: "string" | "number" | "boolean";
}

export interface SemanticTriple {
  subject: SemanticTerm;
  predicate: SemanticTerm;
  object: SemanticTerm;
  sourceRecordId: string;
  provenanceSourceIds: string[];
}

export interface SemanticGraphDocument {
  format: "OMNEVUM_JSONLD_GRAPH";
  version: typeof SEMANTIC_GRAPH_VERSION;
  context: { omnevum: string; rdf: string };
  sourceRecordIds: string[];
  disclosure: { authorizedRecordIds: string[]; excludedRecordCount: number };
  triples: SemanticTriple[];
}

export interface SemanticPattern {
  subject?: string;
  predicate?: string;
  object?: string;
}

export interface SemanticQueryResult {
  kind: "DERIVED_GRAPH_QUERY";
  pattern: SemanticPattern;
  triples: SemanticTriple[];
  sourceRecordIds: string[];
}

export interface SemanticShape {
  id: string;
  targetClass: string;
  requiredPredicates: string[];
}

export interface SemanticValidationViolation {
  shapeId: string;
  subject: string;
  missingPredicates: string[];
  sourceRecordIds: string[];
}

export interface SemanticValidationResult {
  kind: "DERIVED_GRAPH_VALIDATION";
  conforms: boolean;
  violations: SemanticValidationViolation[];
  sourceRecordIds: string[];
}

export function projectAuthorizedSemanticGraph(records: readonly CanonicalRecord[], authorizedIds: Iterable<string> = records.filter((record) => !record.deleted).map((record) => record.id)): SemanticGraphDocument {
  const authorized = new Set(authorizedIds);
  const included = records.filter((record) => !record.deleted && authorized.has(record.id));
  const triples = included.flatMap(recordTriples).sort(compareTriples);
  return {
    format: "OMNEVUM_JSONLD_GRAPH",
    version: SEMANTIC_GRAPH_VERSION,
    context: { omnevum: "https://omnevum.local/vocab#", rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#" },
    sourceRecordIds: included.map((record) => record.id).sort(),
    disclosure: { authorizedRecordIds: included.map((record) => record.id).sort(), excludedRecordCount: records.filter((record) => !record.deleted && !authorized.has(record.id)).length },
    triples
  };
}

export function querySemanticGraph(graph: SemanticGraphDocument, pattern: SemanticPattern): SemanticQueryResult {
  assertGraph(graph);
  const normalized = { ...(pattern.subject?.trim() ? { subject: pattern.subject.trim() } : {}), ...(pattern.predicate?.trim() ? { predicate: pattern.predicate.trim() } : {}), ...(pattern.object?.trim() ? { object: pattern.object.trim() } : {}) };
  const triples = graph.triples.filter((triple) => (!normalized.subject || triple.subject.value === normalized.subject) && (!normalized.predicate || triple.predicate.value === normalized.predicate) && (!normalized.object || triple.object.value === normalized.object)).map((triple) => structuredClone(triple));
  return { kind: "DERIVED_GRAPH_QUERY", pattern: normalized, triples, sourceRecordIds: [...new Set(triples.flatMap((triple) => [triple.sourceRecordId, ...triple.provenanceSourceIds]))].sort() };
}

export function validateSemanticGraph(graph: SemanticGraphDocument, shapes: readonly SemanticShape[]): SemanticValidationResult {
  assertGraph(graph);
  const violations: SemanticValidationViolation[] = [];
  for (const shape of shapes) {
    if (!shape.id.trim() || !shape.targetClass.trim() || shape.requiredPredicates.length === 0) throw new Error("Semantic shape is incomplete");
    const subjects = [...new Set(graph.triples.filter((triple) => triple.predicate.value === "rdf:type" && triple.object.value === shape.targetClass).map((triple) => triple.subject.value))];
    for (const subject of subjects) {
      const predicates = new Set(graph.triples.filter((triple) => triple.subject.value === subject).map((triple) => triple.predicate.value));
      const missingPredicates = shape.requiredPredicates.filter((predicate) => !predicates.has(predicate));
      if (missingPredicates.length > 0) violations.push({ shapeId: shape.id, subject, missingPredicates, sourceRecordIds: [...new Set(graph.triples.filter((triple) => triple.subject.value === subject).flatMap((triple) => [triple.sourceRecordId, ...triple.provenanceSourceIds]))].sort() });
    }
  }
  return { kind: "DERIVED_GRAPH_VALIDATION", conforms: violations.length === 0, violations, sourceRecordIds: [...new Set(violations.flatMap((violation) => violation.sourceRecordIds))].sort() };
}

export function serializeSemanticGraph(graph: SemanticGraphDocument): string {
  assertGraph(graph);
  return JSON.stringify(graph, null, 2);
}

export function parseSemanticGraph(text: string): SemanticGraphDocument {
  if (new TextEncoder().encode(text).byteLength > 16 * 1024 * 1024) throw new Error("Semantic graph exceeds the bounded 16 MiB limit");
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error("Semantic graph is not valid JSON"); }
  assertGraph(parsed);
  return structuredClone(parsed);
}

/** Converts graph data to reviewable Acquire/Triage candidates; it performs no canonical write. */
export function stageSemanticGraphForTriage(graph: SemanticGraphDocument, sourceId: string): AcquireCandidate[] {
  assertGraph(graph);
  if (!sourceId.trim() || sourceId.length > 240) throw new Error("Semantic graph import source identity is invalid");
  const subjects = [...new Set(graph.triples.map((triple) => triple.subject.value))].sort();
  return subjects.map((subject, index) => {
    const triples = graph.triples.filter((triple) => triple.subject.value === subject);
    return {
      candidateId: `${sourceId}:${index + 1}`,
      sourceId: `${sourceId}:${index + 1}`,
      sequence: index + 1,
      recordType: "note",
      owner: "core.acquire",
      kind: "source",
      data: { text: `Semantic graph subject ${subject}`, semanticSubject: subject, semanticTriples: triples, triageStatus: "INBOX", sourceGraphId: sourceId },
      confidence: "REVIEW",
      reason: "Imported graph data requires Acquire/Triage review; no canonical write was performed"
    } satisfies AcquireCandidate;
  });
}

function recordTriples(record: CanonicalRecord): SemanticTriple[] {
  const subject = iri(`record:${record.id}`);
  const base = [
    triple(subject, iri("rdf:type"), literal(record.recordType), record),
    triple(subject, iri("omnevum:owner"), literal(record.owner), record),
    triple(subject, iri("omnevum:truthClass"), literal(record.truthClass), record),
    triple(subject, iri("omnevum:sensitivity"), literal(record.sensitivity), record),
    triple(subject, iri("omnevum:provenanceKind"), literal(record.provenance.source), record),
    ...(record.provenance.sourceId ? [triple(subject, iri("omnevum:provenanceSourceId"), literal(record.provenance.sourceId), record)] : [])
  ];
  const dataTriples = Object.entries(record.data).flatMap(([key, value]) => scalarTerm(value) ? [triple(subject, iri(`omnevum:data.${key}`), scalarTerm(value)!, record)] : []);
  const relationshipTriples = record.recordType === "relationship" && typeof record.data.sourceId === "string" && typeof record.data.targetId === "string" ? [triple(subject, iri("omnevum:source"), iri(`record:${record.data.sourceId}`), record), triple(subject, iri("omnevum:target"), iri(`record:${record.data.targetId}`), record)] : [];
  return [...base, ...dataTriples, ...relationshipTriples];
}

function triple(subject: SemanticTerm, predicate: SemanticTerm, object: SemanticTerm, record: CanonicalRecord): SemanticTriple {
  return { subject, predicate, object, sourceRecordId: record.id, provenanceSourceIds: record.provenance.sourceId ? [record.provenance.sourceId] : [] };
}

function iri(value: string): SemanticTerm { return { kind: "IRI", value: value.startsWith("record:") ? `urn:omnevum:${value}` : value }; }
function literal(value: string): SemanticTerm { return { kind: "LITERAL", value, datatype: "string" }; }

function scalarTerm(value: unknown): SemanticTerm | undefined {
  if (typeof value === "string") return literal(value.slice(0, 4_000));
  if (typeof value === "number" && Number.isFinite(value)) return { kind: "LITERAL", value: String(value), datatype: "number" };
  if (typeof value === "boolean") return { kind: "LITERAL", value: String(value), datatype: "boolean" };
  return undefined;
}

function assertGraph(value: unknown): asserts value is SemanticGraphDocument {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Semantic graph is invalid");
  const graph = value as Partial<SemanticGraphDocument>;
  if (graph.format !== "OMNEVUM_JSONLD_GRAPH" || graph.version !== SEMANTIC_GRAPH_VERSION || !Array.isArray(graph.sourceRecordIds) || !graph.disclosure || !Array.isArray(graph.triples) || graph.triples.length > 200_000) throw new Error("Semantic graph is invalid");
  const sourceRecordIds = graph.sourceRecordIds;
  const triples = graph.triples;
  if (triples.some((triple) => !isTriple(triple))) throw new Error("Semantic graph contains an invalid triple");
  if (triples.some((triple) => !sourceRecordIds.includes(triple.sourceRecordId))) throw new Error("Semantic graph triple is outside its disclosed source set");
}

function isTriple(value: unknown): value is SemanticTriple {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const triple = value as Partial<SemanticTriple>;
  return isTerm(triple.subject) && isTerm(triple.predicate) && isTerm(triple.object) && typeof triple.sourceRecordId === "string" && GRAPH_ID.test(triple.sourceRecordId) && Array.isArray(triple.provenanceSourceIds) && triple.provenanceSourceIds.every((id) => typeof id === "string" && id.length <= 240);
}

function isTerm(value: unknown): value is SemanticTerm {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const term = value as Partial<SemanticTerm>;
  return (term.kind === "IRI" || term.kind === "LITERAL") && typeof term.value === "string" && term.value.length > 0 && term.value.length <= 4_000 && (term.datatype === undefined || ["string", "number", "boolean"].includes(term.datatype));
}

function compareTriples(left: SemanticTriple, right: SemanticTriple): number {
  return [left.subject.value, left.predicate.value, left.object.value, left.sourceRecordId].join("\0").localeCompare([right.subject.value, right.predicate.value, right.object.value, right.sourceRecordId].join("\0"));
}
