import { describe, expect, it } from "vitest";
import { lensIdsForRecord, projectLensRecords } from "./lenses";
import type { CanonicalRecord } from "./model";

const record = (id: string, overrides: Partial<CanonicalRecord> = {}): CanonicalRecord => ({
  id,
  recordType: "note",
  owner: "core.capture",
  schemaVersion: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  modifiedAt: "2026-01-01T00:00:00.000Z",
  provenance: { source: "USER_INPUT", capturedAt: "2026-01-01T00:00:00.000Z" },
  truthClass: "USER_OBSERVATION",
  sensitivity: "PRIVATE",
  revision: 1,
  deleted: false,
  data: { text: id, kind: "note", space: "work" },
  ...overrides
});

describe("presentation lens projections", () => {
  it("reuses one canonical record in multiple deterministic projections", () => {
    const shared = record("shared", { recordType: "task", data: { text: "Ship the work task", kind: "task", space: "work" } });
    expect(lensIdsForRecord(shared)).toEqual(["direction", "work", "change"]);
    expect(projectLensRecords([shared], "direction").map((item) => item.id)).toEqual(["shared"]);
    expect(projectLensRecords([shared], "work").map((item) => item.id)).toEqual(["shared"]);
  });

  it("keeps archived and cleanup-history records out of projections", () => {
    const archived = record("archived", { deleted: true });
    const cleanup = record("cleanup", { data: { text: "cleanup", kind: "cleanup-history", space: "personal" } });
    expect(projectLensRecords([archived, cleanup], "self")).toEqual([]);
  });

  it("covers the built-in domain kinds without projecting references into Self", () => {
    const cases: Array<[string, Partial<CanonicalRecord>, string[]]> = [
      ["person", { data: { text: "person", kind: "person", space: "personal" }, subjectId: "person-1" }, ["people", "self"]],
      ["expense", { recordType: "observation", owner: "domain.finance", data: { text: "expense", kind: "expense", space: "personal" } }, ["self", "resources", "change"]],
      ["health", { recordType: "observation", owner: "domain.health", subjectId: "person-1", data: { text: "health", kind: "health-measurement", space: "personal" } }, ["people", "self", "resources", "change"]],
      ["place", { recordType: "observation", owner: "platform.place", data: { text: "place", kind: "place", space: "personal" } }, ["self", "environment", "change"]],
      ["source", { recordType: "artifact", owner: "platform.artifact", data: { text: "source", kind: "source" } }, ["resources", "knowledge"]],
      ["reference", { recordType: "relationship", owner: "platform.relate", data: { text: "reference", kind: "related", space: "personal" } }, ["knowledge"]],
      ["workout", { recordType: "observation", owner: "platform.track", data: { text: "workout", kind: "workout", space: "work" } }, ["resources", "work", "environment", "change"]]
    ];
    for (const [id, overrides, expected] of cases) {
      expect(lensIdsForRecord(record(id, overrides))).toEqual(expected);
    }
  });
});
