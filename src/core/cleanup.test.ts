import { describe, expect, it } from "vitest";
import type { CanonicalRecord } from "./model";
import { applyCleanupDecisions, previewCleanup, replayCleanup, type CleanupRecipe } from "./cleanup";

const recipe: CleanupRecipe = { schemaVersion: 1, recipeId: "safe-text-cleanup", name: "Safe text cleanup", operations: [{ kind: "TRIM_TEXT" }, { kind: "NORMALIZE_WHITESPACE" }] };

function record(id: string, text: string, sourceId: string, sourceFields?: Record<string, unknown>): CanonicalRecord {
  const now = "2026-09-18T00:00:00.000Z";
  return { id, recordType: "note", owner: "core.acquire", schemaVersion: 1, createdAt: now, modifiedAt: now, provenance: { source: "IMPORT", capturedAt: now, sourceId }, truthClass: "IMPORTED_RECORD", sensitivity: "PRIVATE", revision: 1, deleted: false, data: { text, sourceFields: sourceFields ?? {}, kind: "note" } };
}

describe("bounded Acquire cleanup and reconciliation", () => {
  it("previews deterministic transforms, groups source provenance, and replays identically", () => {
    const records = [record("one", "  Hello   world ", "source:a"), record("two", "Other", "source:b")];

    const preview = previewCleanup(records, recipe);
    const replay = replayCleanup(records, recipe);

    expect(preview.proposals).toContainEqual(expect.objectContaining({ proposalId: "cleanup:transform:one", kind: "TRANSFORM", beforeText: "  Hello   world ", afterText: "Hello world" }));
    expect(preview.sourceGroups).toEqual([{ sourceId: "source:a", recordIds: ["one"] }, { sourceId: "source:b", recordIds: ["two"] }]);
    expect(replay).toEqual(preview);
    expect(records[0]?.data.text).toBe("  Hello   world ");
  });

  it("clusters exact duplicates and leaves conflicting stable entities for review", () => {
    const records = [
      record("one", "Same note", "source:a", { externalId: "A-1" }),
      record("two", "Same note", "source:b", { externalId: "B-1" }),
      record("three", "Different note", "source:c", { externalId: "A-1" })
    ];

    const preview = previewCleanup(records, recipe);
    expect(preview.proposals).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "EXACT_DUPLICATE", disposition: "REVIEW_REQUIRED", recordIds: ["one", "two"] }),
      expect.objectContaining({ kind: "AMBIGUOUS_MATCH", disposition: "REVIEW_REQUIRED", recordIds: ["one", "three"] })
    ]));
    expect(() => applyCleanupDecisions(records, preview, [{ proposalId: "cleanup:ambiguous:one,three", action: "ARCHIVE_EXACT_DUPLICATE" }])).toThrow("exact-duplicate");

    const exact = preview.proposals.find((proposal) => proposal.kind === "EXACT_DUPLICATE");
    if (!exact) throw new Error("Expected exact duplicate proposal");
    const plan = applyCleanupDecisions(records, preview, [{ proposalId: exact.proposalId, action: "ARCHIVE_EXACT_DUPLICATE", archiveRecordIds: ["two"] }]);
    expect(plan.archiveRecordIds).toEqual(["two"]);
    expect(plan.reviewRecordIds).toEqual([]);
  });

  it("requires explicit review decisions and never archives an entire cluster", () => {
    const records = [record("one", "Same", "source:a"), record("two", "Same", "source:b")];
    const preview = previewCleanup(records, recipe);
    const duplicate = preview.proposals.find((proposal) => proposal.kind === "EXACT_DUPLICATE");
    if (!duplicate) throw new Error("Expected exact duplicate proposal");
    expect(() => applyCleanupDecisions(records, preview, [{ proposalId: duplicate.proposalId, action: "ARCHIVE_EXACT_DUPLICATE", archiveRecordIds: ["one", "two"] }])).toThrow("not all");
    const transform = preview.proposals.find((proposal) => proposal.kind === "TRANSFORM");
    expect(transform).toBeUndefined();
  });
});
