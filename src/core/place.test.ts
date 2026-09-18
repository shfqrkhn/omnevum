import { describe, expect, it } from "vitest";
import { distanceKm, makePlaceData, parseGeoJsonPoint } from "./place";

describe("Place/Geo", () => {
  it("parses a standard point and keeps geometry separate from identity", () => {
    expect(parseGeoJsonPoint({ type: "Point", coordinates: [-79.3832, 43.6532] })).toEqual({ latitude: 43.6532, longitude: -79.3832 });
    expect(makePlaceData("Toronto", { latitude: 43.6532, longitude: -79.3832 })).toMatchObject({ kind: "place", label: "Toronto" });
  });

  it("bounds geometry and returns a derived distance", () => {
    expect(() => parseGeoJsonPoint({ type: "Point", coordinates: [181, 0] })).toThrow("WGS84");
    expect(distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 })).toBeCloseTo(111.195, 1);
  });
});
