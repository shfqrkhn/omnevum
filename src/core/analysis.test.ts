import { describe, expect, it } from "vitest";
import { countRecords, groupCounts, summarizeNumbers } from "./analysis";
import type { CanonicalRecord } from "./model";

function record(id: string, value: number, space: string): CanonicalRecord {
  return { id, recordType: "observation", owner: "platform.track", schemaVersion: 1, createdAt: "2026-01-01T00:00:00.000Z", modifiedAt: "2026-01-01T00:00:00.000Z", provenance: { source: "USER_INPUT", capturedAt: "2026-01-01T00:00:00.000Z" }, truthClass: "USER_OBSERVATION", sensitivity: "PRIVATE", revision: 1, deleted: false, data: { value, space } };
}

describe("descriptive analysis", () => {
  it("returns explicit derived count, average, and grouping", () => {
    const records = [record("a", 2, "personal"), record("b", 4, "work")];
    expect(countRecords(records).value).toBe(2);
    expect(summarizeNumbers(records, "data.value").value).toBe(3);
    expect(groupCounts(records, "data.space").value).toEqual({ personal: 1, work: 1 });
  });
});
