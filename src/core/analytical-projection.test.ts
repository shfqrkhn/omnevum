import { describe, expect, it } from "vitest";
import { characterizeAnalyticalFormat, projectLocalTabular, queryAnalyticalProjection } from "./analytical-projection";

describe("bounded local analytical projection", () => {
  it("projects CSV and queries derived rows without canonical ownership or remote fetch", () => {
    const projection = projectLocalTabular("name,amount\ncoffee,4\nrent,1200\n", "CSV", "source:csv");
    const result = queryAnalyticalProjection(projection, { select: ["name", "amount"], filters: [{ column: "amount", operator: "GT", value: 10 }] });
    expect(projection).toMatchObject({ sourceId: "source:csv", derived: true, canonicalOwner: "NONE", remoteFetch: "DISABLED" });
    expect(result.rows).toEqual([{ name: "rent", amount: 1200 }]);
    expect(result.kind).toBe("DERIVED_ANALYTICAL_RESULT");
  });

  it("supports JSON scalar rows and cancellation", () => {
    const projection = projectLocalTabular(JSON.stringify([{ label: "alpha", score: 1 }, { label: "beta", score: 2 }]), "JSON", "source:json");
    const controller = new AbortController();
    controller.abort();
    expect(() => queryAnalyticalProjection(projection, { select: ["label"] }, controller.signal)).toThrow("cancelled");
    expect(queryAnalyticalProjection(projection, { select: ["label"], filters: [{ column: "label", operator: "CONTAINS", value: "bet" }] }).rows).toEqual([{ label: "beta" }]);
  });

  it("characterizes Parquet as platform-limited instead of fetching an extension", () => {
    expect(characterizeAnalyticalFormat("PARQUET")).toMatchObject({ status: "PLATFORM_LIMITED", remoteFetch: "DISABLED" });
    expect(() => projectLocalTabular("[{\"nested\":{}}]", "JSON", "source:bad")).toThrow("scalar");
  });
});
