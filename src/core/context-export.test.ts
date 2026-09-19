import { describe, expect, it } from "vitest";
import type { CanonicalRecord } from "./model";
import { createContextDelta, exportContext, makeContextExportProfile, parseContextExportProfile } from "./context-export";

function record(id: string, recordType: CanonicalRecord["recordType"] = "note", truthClass: CanonicalRecord["truthClass"] = "USER_OBSERVATION", data: Record<string, unknown> = { text: id }): CanonicalRecord {
  return {
    id,
    recordType,
    owner: recordType === "relationship" ? "platform.evidence" : "core.capture",
    schemaVersion: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    modifiedAt: "2026-01-02T00:00:00.000Z",
    provenance: { source: "IMPORT", capturedAt: "2026-01-01T00:00:00.000Z", sourceId: `source:${id}` },
    truthClass,
    sensitivity: "PRIVATE",
    revision: 1,
    deleted: false,
    data
  };
}

const profile = (format: "MARKDOWN" | "TEXT" | "JSON" | "JSONL" | "CSV" | "TSV", recordIds: string[] = ["fact", "assumption", "derived", "conflict"]) => makeContextExportProfile({ id: "handoff", label: "Review handoff", format, recordIds, purpose: "review", objective: "Decide what needs attention", includePrivate: true, maxBytes: 100_000, detail: "FULL" });

describe("bounded Context Export/Handoff", () => {
  it("keeps one logical authorized context across human and JSON formats", () => {
    const records = [
      record("fact"),
      record("assumption", "observation", "ASSUMPTION", { value: 12, unit: "months" }),
      record("derived", "observation", "DERIVED", { value: 13, sourceIds: ["fact"] }),
      record("conflict", "relationship", "SOURCE_CLAIM", { relation: "CONTRADICTS", sourceId: "fact", targetId: "assumption", uncertainty: "open" })
    ];
    const outputs = ["MARKDOWN", "TEXT", "JSON"].map((format) => exportContext(records, profile(format as "MARKDOWN" | "TEXT" | "JSON"), "2026-01-03T00:00:00.000Z"));
    expect(outputs.map((output) => output.package.manifest.sourceRecordIds)).toEqual(Array.from({ length: 3 }, () => ["assumption", "conflict", "derived", "fact"]));
    expect(outputs.every((output) => output.package.manifest.recordCount === 4 && output.package.manifest.generatedAt === "2026-01-03T00:00:00.000Z")).toBe(true);
    expect(outputs[0]?.package.assumptions[0]?.truthClass).toBe("ASSUMPTION");
    expect(outputs[0]?.package.derived[0]?.truthClass).toBe("DERIVED");
    expect(outputs[0]?.package.unresolvedIssues[0]?.data.relation).toBe("CONTRADICTS");
    expect(outputs[0]?.package.framing.writeAuthority).toBe("NONE");
    expect(outputs[0]?.content).toContain('"sourceId": "fact"');
    expect(outputs[1]?.content).toContain('"sourceId":"fact"');
    expect(JSON.parse(outputs[2]!.content).manifest.sourceRecordIds).toEqual(["assumption", "conflict", "derived", "fact"]);
  });

  it("exports homogeneous observations to inert CSV/TSV and preserves exact JSONL values", () => {
    const records = [record("one", "observation", "USER_OBSERVATION", { value: "=SUM(A1:A2)", unit: "CAD", currency: "CAD" }), record("two", "observation", "USER_OBSERVATION", { value: "@external", unit: "CAD", currency: "CAD" })];
    const csv = exportContext(records, profile("CSV", ["one", "two"]), "2026-01-03T00:00:00.000Z");
    const tsv = exportContext(records, profile("TSV", ["one", "two"]), "2026-01-03T00:00:00.000Z");
    const jsonl = exportContext(records, profile("JSONL", ["one", "two"]), "2026-01-03T00:00:00.000Z");
    expect(csv.content).toContain("'=SUM(A1:A2)");
    expect(csv.content).toContain("'@external");
    expect(tsv.content).toContain("'=SUM(A1:A2)");
    expect(csv.package.manifest.transformations).toHaveLength(2);
    expect(csv.package.manifest.lossless).toBe(false);
    const jsonLines = jsonl.content.trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
    expect((jsonLines[1]?.data as Record<string, unknown>).value).toBe("=SUM(A1:A2)");
  });

  it("refuses to silently flatten hierarchy or many-to-many relationships", () => {
    const hierarchical = [record("one", "note", "USER_OBSERVATION", { text: "one", links: ["two"] }), record("two", "note", "USER_OBSERVATION", { text: "two" })];
    expect(() => exportContext(hierarchical, profile("CSV", ["one", "two"]))).toThrow(/homogeneous|hierarchy|many-to-many/iu);
    const relationship = [record("link", "relationship", "SOURCE_CLAIM", { relation: "related", sourceId: "one", targetId: "two" })];
    expect(() => exportContext(relationship, profile("CSV", ["link"]))).toThrow(/homogeneous|hierarchy|many-to-many/iu);
  });

  it("applies a deterministic budget and exposes omissions instead of claiming losslessness", () => {
    const records = Array.from({ length: 8 }, (_, index) => record(`record-${index}`, "observation", "USER_OBSERVATION", { text: "long evidence ".repeat(80), value: index, unit: "CAD", currency: "CAD", optional: { nested: true } }));
    const output = exportContext(records, makeContextExportProfile({ ...profile("JSON", records.map((item) => item.id)), maxBytes: 4_000 }), "2026-01-03T00:00:00.000Z");
    expect(output.bytes).toBeLessThanOrEqual(4_000);
    expect(output.package.manifest.lossless).toBe(false);
    expect(output.package.manifest.omitted.some((item) => item.kind === "BUDGET")).toBe(true);
    expect(output.package.canonicalFacts.every((item) => typeof item.data.value === "number")).toBe(true);
  });

  it("supports saved profiles, reruns, and material delta classification", () => {
    const saved = parseContextExportProfile({ ...profile("JSON", ["a", "b"]), id: "saved-review" });
    const previous = exportContext([record("a"), record("b")], saved, "2026-01-01T00:00:00.000Z");
    const current = exportContext([record("a", "note", "USER_OBSERVATION", { text: "changed" }), record("c")], { ...saved, recordIds: ["a", "b", "c"] }, "2026-01-02T00:00:00.000Z");
    const delta = createContextDelta(previous.snapshot, current);
    expect(delta.added.map((item) => item.id)).toEqual(["c"]);
    expect(delta.modified.map((item) => item.id)).toEqual(["a"]);
    expect(delta.deletedOrInvalidated).toEqual(["b"]);
    expect(delta.unchanged).toEqual([]);
  });

  it("excludes selected deleted and disclosure-ineligible records with an inspectable manifest", () => {
    const deleted = { ...record("deleted"), deleted: true };
    const privateRecord = record("private");
    const output = exportContext([deleted, privateRecord], makeContextExportProfile({ id: "safe", label: "Safe", format: "JSON", recordIds: ["deleted", "private"], maxBytes: 10_000, includePrivate: false }));
    expect(output.package.canonicalFacts).toHaveLength(0);
    expect(output.package.manifest.omitted.map((item) => item.kind)).toEqual(["DELETED", "UNAUTHORIZED"]);
  });
});
