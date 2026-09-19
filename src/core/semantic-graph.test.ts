import { describe, expect, it } from "vitest";
import type { CanonicalRecord } from "./model";
import { parseSemanticGraph, projectAuthorizedSemanticGraph, querySemanticGraph, serializeSemanticGraph, stageSemanticGraphForTriage, validateSemanticGraph } from "./semantic-graph";

function record(id: string, data: Record<string, unknown>, sourceId?: string): CanonicalRecord {
  const now = "2026-09-19T19:00:00.000Z";
  return { id, recordType: "note", owner: "core.capture", schemaVersion: 1, createdAt: now, modifiedAt: now, provenance: { source: "IMPORT", capturedAt: now, ...(sourceId ? { sourceId } : {}) }, truthClass: "IMPORTED_RECORD", sensitivity: "PRIVATE", revision: 1, deleted: false, data };
}

describe("authorized semantic graph projection", () => {
  it("preserves source/provenance while excluding unauthorized records", () => {
    const graph = projectAuthorizedSemanticGraph([record("one", { text: "visible", count: 2 }, "source:one"), record("two", { text: "private" }, "source:two")], ["one"]);
    expect(graph.sourceRecordIds).toEqual(["one"]);
    expect(graph.disclosure.excludedRecordCount).toBe(1);
    expect(graph.triples.some((triple) => triple.object.value === "source:one")).toBe(true);
    expect(graph.triples.some((triple) => triple.object.value === "private")).toBe(false);
  });

  it("queries and validates derived graph output with source-bound violations", () => {
    const graph = projectAuthorizedSemanticGraph([record("one", { text: "visible" }, "source:one")]);
    const query = querySemanticGraph(graph, { predicate: "omnevum:owner" });
    expect(query.kind).toBe("DERIVED_GRAPH_QUERY");
    expect(query.sourceRecordIds).toEqual(["one", "source:one"]);
    const validation = validateSemanticGraph(graph, [{ id: "note-shape", targetClass: "note", requiredPredicates: ["omnevum:owner", "omnevum:missing"] }]);
    expect(validation.conforms).toBe(false);
    expect(validation.violations[0]).toMatchObject({ shapeId: "note-shape", subject: "urn:omnevum:record:one", missingPredicates: ["omnevum:missing"] });
  });

  it("round-trips a bounded graph and stages import through Acquire/Triage candidates", () => {
    const graph = projectAuthorizedSemanticGraph([record("one", { text: "visible" }, "source:one")]);
    const parsed = parseSemanticGraph(serializeSemanticGraph(graph));
    const candidates = stageSemanticGraphForTriage(parsed, "source:graph");
    expect(candidates).toMatchObject([{ recordType: "note", owner: "core.acquire", kind: "source", confidence: "REVIEW", data: { triageStatus: "INBOX" } }]);
    expect(candidates[0]?.reason).toContain("no canonical write");
  });
});
