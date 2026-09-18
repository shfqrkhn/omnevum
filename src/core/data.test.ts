import { describe, expect, it } from "vitest";
import { projectDataset, readPath } from "./data";
import type { CanonicalRecord } from "./model";

const record: CanonicalRecord = {
  id: "data-1", recordType: "observation", owner: "platform.track", schemaVersion: 1,
  createdAt: "2026-01-01T00:00:00.000Z", modifiedAt: "2026-01-01T00:00:00.000Z",
  provenance: { source: "USER_INPUT", capturedAt: "2026-01-01T00:00:00.000Z" },
  truthClass: "USER_OBSERVATION", sensitivity: "PRIVATE", revision: 1, deleted: false,
  data: { metricName: "sleep", value: 8 }
};

describe("derived Data projections", () => {
  it("projects explicit fields without creating canonical records", () => {
    const result = projectDataset([record], ["id", "data.value"]);
    expect(result.truthClass).toBe("DERIVED");
    expect(result.sourceIds).toEqual(["data-1"]);
    expect(result.rows).toEqual([{ id: "data-1", "data.value": 8 }]);
  });

  it("refuses prototype paths", () => {
    expect(readPath(record, "data.__proto__.constructor")).toBeUndefined();
    expect(() => projectDataset([record], ["__proto__"])).toThrow("safe field");
  });
});
