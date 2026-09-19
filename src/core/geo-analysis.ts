import { distanceKm, assertCoordinates, type Coordinates } from "./place";

export const MAX_GEO_POINTS = 10_000;

export type GeoGeometry =
  | { type: "Point"; coordinates: [number, number] }
  | { type: "LineString"; coordinates: [number, number][] };

export interface GeoAnalysisResult {
  kind: "DERIVED_GEO_ANALYSIS";
  operation: "DISTANCE" | "SIMPLIFY";
  engineId: string;
  coordinateReference: "WGS84_LON_LAT";
  sourceRecordIds: string[];
  canonicalOwner: "NONE";
  output: number | GeoGeometry;
}

export function distanceBetweenGeoPoints(from: GeoGeometry, to: GeoGeometry, sourceRecordIds: readonly string[] = []): GeoAnalysisResult {
  if (from.type !== "Point" || to.type !== "Point") throw new Error("Distance analysis requires two GeoJSON Points");
  const fromCoordinates = toCoordinates(from.coordinates);
  const toCoordinatesValue = toCoordinates(to.coordinates);
  return { kind: "DERIVED_GEO_ANALYSIS", operation: "DISTANCE", engineId: "omnevum-bounded-geo-v1", coordinateReference: "WGS84_LON_LAT", sourceRecordIds: normalizeSourceIds(sourceRecordIds), canonicalOwner: "NONE", output: distanceKm(fromCoordinates, toCoordinatesValue) };
}

export function simplifyGeoLine(line: GeoGeometry, toleranceMeters: number, sourceRecordIds: readonly string[] = [], engineId = "omnevum-bounded-geo-v1"): GeoAnalysisResult {
  if (line.type !== "LineString") throw new Error("Simplification requires a GeoJSON LineString");
  if (!Number.isFinite(toleranceMeters) || toleranceMeters <= 0 || toleranceMeters > 1_000_000) throw new Error("Geo simplification tolerance is outside the supported bound");
  if (line.coordinates.length < 2 || line.coordinates.length > MAX_GEO_POINTS) throw new Error("Geo line point count is outside the supported bound");
  const simplified = simplify(line.coordinates, toleranceMeters);
  return { kind: "DERIVED_GEO_ANALYSIS", operation: "SIMPLIFY", engineId: normalizeEngineId(engineId), coordinateReference: "WGS84_LON_LAT", sourceRecordIds: normalizeSourceIds(sourceRecordIds), canonicalOwner: "NONE", output: { type: "LineString", coordinates: simplified } };
}

export function replaceGeoAnalysisEngine(result: GeoAnalysisResult, engineId: string): GeoAnalysisResult {
  if (result.kind !== "DERIVED_GEO_ANALYSIS" || result.canonicalOwner !== "NONE") throw new Error("Geo analysis result is invalid");
  return { ...structuredClone(result), engineId: normalizeEngineId(engineId) };
}

function simplify(points: [number, number][], toleranceMeters: number): [number, number][] {
  const projected = points.map((point) => project(point, points[0]!));
  const keep = new Set<number>([0, points.length - 1]);
  const visit = (start: number, end: number): void => {
    let maxDistance = toleranceMeters;
    let index = -1;
    for (let candidate = start + 1; candidate < end; candidate += 1) {
      const distance = perpendicularDistance(projected[candidate]!, projected[start]!, projected[end]!);
      if (distance > maxDistance) { maxDistance = distance; index = candidate; }
    }
    if (index >= 0) { keep.add(index); visit(start, index); visit(index, end); }
  };
  visit(0, points.length - 1);
  return [...keep].sort((left, right) => left - right).map((index) => points[index]!);
}

function project(point: [number, number], origin: [number, number]): { x: number; y: number } {
  const radians = Math.PI / 180;
  const scale = 6_371_008.8 * radians;
  const meanLatitude = ((point[1] + origin[1]) / 2) * radians;
  return { x: (point[0] - origin[0]) * Math.cos(meanLatitude) * scale, y: (point[1] - origin[1]) * scale };
}

function perpendicularDistance(point: { x: number; y: number }, start: { x: number; y: number }, end: { x: number; y: number }): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const projection = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (start.x + projection * dx), point.y - (start.y + projection * dy));
}

function toCoordinates(coordinates: [number, number]): Coordinates {
  const result = { latitude: coordinates[1], longitude: coordinates[0] };
  assertCoordinates(result);
  return result;
}

function normalizeSourceIds(sourceRecordIds: readonly string[]): string[] {
  if (sourceRecordIds.some((id) => !id.trim() || id.length > 240)) throw new Error("Geo source identity is invalid");
  return [...new Set(sourceRecordIds)].sort();
}

function normalizeEngineId(engineId: string): string {
  if (!/^[a-z][a-z0-9._-]{1,80}$/u.test(engineId.trim())) throw new Error("Geo engine identity is invalid");
  return engineId.trim();
}
