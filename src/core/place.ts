export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface PlaceData extends Coordinates {
  kind: "place";
  label: string;
  source?: string;
  accuracyMeters?: number;
}

export function makePlaceData(label: string, coordinates: Coordinates, source = "USER_INPUT"): PlaceData {
  assertCoordinates(coordinates);
  const trimmed = label.trim();
  if (!trimmed) throw new Error("Place label is required");
  return { kind: "place", label: trimmed.slice(0, 240), latitude: coordinates.latitude, longitude: coordinates.longitude, source };
}

export function parseGeoJsonPoint(value: unknown): Coordinates {
  if (typeof value !== "object" || value === null) throw new Error("GeoJSON object is required");
  const candidate = value as { type?: unknown; coordinates?: unknown };
  if (candidate.type !== "Point" || !Array.isArray(candidate.coordinates) || candidate.coordinates.length < 2 || typeof candidate.coordinates[0] !== "number" || typeof candidate.coordinates[1] !== "number") throw new Error("Only a GeoJSON Point with numeric coordinates is supported");
  const coordinates = { latitude: candidate.coordinates[1], longitude: candidate.coordinates[0] };
  assertCoordinates(coordinates);
  return coordinates;
}

export function distanceKm(from: Coordinates, to: Coordinates): number {
  assertCoordinates(from);
  assertCoordinates(to);
  const radians = Math.PI / 180;
  const dLatitude = (to.latitude - from.latitude) * radians;
  const dLongitude = (to.longitude - from.longitude) * radians;
  const a = Math.sin(dLatitude / 2) ** 2 + Math.cos(from.latitude * radians) * Math.cos(to.latitude * radians) * Math.sin(dLongitude / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function assertCoordinates(value: Coordinates): void {
  if (!Number.isFinite(value.latitude) || value.latitude < -90 || value.latitude > 90 || !Number.isFinite(value.longitude) || value.longitude < -180 || value.longitude > 180) throw new Error("Coordinates are outside the WGS84 bounds");
}
