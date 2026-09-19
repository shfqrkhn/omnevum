import { describe, expect, it } from "vitest";
import { distanceBetweenGeoPoints, replaceGeoAnalysisEngine, simplifyGeoLine } from "./geo-analysis";

describe("bounded derived Geo analysis", () => {
  it("computes a WGS84 point distance without canonical ownership", () => {
    const result = distanceBetweenGeoPoints({ type: "Point", coordinates: [0, 0] }, { type: "Point", coordinates: [1, 0] }, ["place-a", "place-b"]);
    expect(result).toMatchObject({ kind: "DERIVED_GEO_ANALYSIS", operation: "DISTANCE", canonicalOwner: "NONE", sourceRecordIds: ["place-a", "place-b"] });
    expect(result.output as number).toBeCloseTo(111.195, 1);
  });

  it("simplifies a line with an explicit WGS84 tolerance and preserves endpoints", () => {
    const result = simplifyGeoLine({ type: "LineString", coordinates: [[0, 0], [0.00001, 0.00001], [0.001, 0]] }, 5, ["track-1"]);
    expect(result.output).toMatchObject({ type: "LineString", coordinates: [[0, 0], [0.001, 0]] });
    expect(result.coordinateReference).toBe("WGS84_LON_LAT");
  });

  it("changes only the replaceable engine identity", () => {
    const result = distanceBetweenGeoPoints({ type: "Point", coordinates: [0, 0] }, { type: "Point", coordinates: [1, 0] }, ["place-a"]);
    const replaced = replaceGeoAnalysisEngine(result, "qualified-geo-v2");
    expect(replaced).toMatchObject({ engineId: "qualified-geo-v2", output: result.output, sourceRecordIds: ["place-a"], canonicalOwner: "NONE" });
    expect(() => replaceGeoAnalysisEngine(result, "bad engine")).toThrow("engine");
  });
});
