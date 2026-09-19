import type { AcquireCandidate } from "./acquire";

export const MAX_HEALTH_IMPORT_BYTES = 16 * 1024 * 1024;
export const MAX_HEALTH_IMPORT_ROWS = 50_000;

export type HealthImportFormat = "CSV" | "JSON";

export interface HealthImportCapability {
  fileImport: "SUPPORTED_WITH_LIMITS";
  directBrowserHealthApi: "PLATFORM_LIMITED";
  notes: string;
}

export interface HealthExportMeasurement {
  externalId: string;
  metric: string;
  value: number;
  unit: string;
  measuredAt: string;
  subjectId: string;
  sourceId: string;
}

export function characterizeHealthImport(): HealthImportCapability {
  return { fileImport: "SUPPORTED_WITH_LIMITS", directBrowserHealthApi: "PLATFORM_LIMITED", notes: "Static-browser health import accepts a user export; direct HealthKit/Health Connect access requires an optional qualified companion and is never implied by file import." };
}

export function parseHealthExport(text: string, format: HealthImportFormat, sourceId: string, subjectId: string): HealthExportMeasurement[] {
  if (new TextEncoder().encode(text).byteLength > MAX_HEALTH_IMPORT_BYTES) throw new Error("Health export exceeds the bounded 16 MiB limit");
  if (!sourceId.trim() || !subjectId.trim() || sourceId.length > 240 || subjectId.length > 160) throw new Error("Health import source or subject identity is invalid");
  const rawRows = format === "CSV" ? parseCsv(text) : parseJson(text);
  if (rawRows.length > MAX_HEALTH_IMPORT_ROWS) throw new Error("Health export rows exceed the supported bound");
  const measurements = rawRows.map((row, index) => normalizeMeasurement(row, sourceId, subjectId, index + 1));
  const ids = new Set<string>();
  return measurements.filter((measurement) => {
    if (ids.has(measurement.externalId)) return false;
    ids.add(measurement.externalId);
    return true;
  });
}

export function stageHealthExportForTriage(measurements: readonly HealthExportMeasurement[]): AcquireCandidate[] {
  return measurements.map((measurement, index) => ({
    candidateId: `${measurement.sourceId}:${measurement.externalId}`,
    sourceId: `${measurement.sourceId}:${measurement.externalId}`,
    sequence: index + 1,
    recordType: "observation",
    owner: "platform.health",
    kind: "measurement",
    data: { text: `${measurement.metric}: ${measurement.value} ${measurement.unit}`, metric: measurement.metric, value: measurement.value, unit: measurement.unit, measuredAt: measurement.measuredAt, subjectId: measurement.subjectId, sourceId: measurement.sourceId, externalId: measurement.externalId, triageStatus: "INBOX" },
    confidence: "HIGH",
    reason: "User health export measurement staged for review; provenance and subject identity are preserved"
  } satisfies AcquireCandidate));
}

function parseJson(text: string): Record<string, unknown>[] {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error("Health export JSON is invalid"); }
  const values = Array.isArray(parsed) ? parsed : isRecord(parsed) && Array.isArray(parsed.measurements) ? parsed.measurements : [parsed];
  return values.map((value) => isRecord(value) ? value : {});
}

function parseCsv(text: string): Record<string, unknown>[] {
  const rows = csvRows(text);
  const headers = rows.shift() ?? [];
  if (headers.length === 0 || headers.some((header) => !/^[A-Za-z][A-Za-z0-9_.-]{0,80}$/u.test(header)) || new Set(headers).size !== headers.length) throw new Error("Health export CSV headers are invalid");
  return rows.filter((row) => row.some((value) => value.trim())).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

function normalizeMeasurement(row: Record<string, unknown>, sourceId: string, subjectId: string, sequence: number): HealthExportMeasurement {
  const externalId = stringValue(row.externalId ?? row.id) || `row-${sequence}`;
  const metric = stringValue(row.metric ?? row.type ?? row.name);
  const value = typeof row.value === "number" ? row.value : Number(stringValue(row.value));
  const unit = stringValue(row.unit) || "unspecified";
  const measuredAt = stringValue(row.measuredAt ?? row.timestamp ?? row.date);
  if (!metric || !Number.isFinite(value) || !unit || !measuredAt || Number.isNaN(Date.parse(measuredAt))) throw new Error(`Health measurement row ${sequence} is invalid`);
  return { externalId: externalId.slice(0, 240), metric: metric.trim().slice(0, 160), value, unit: unit.trim().slice(0, 80), measuredAt: new Date(measuredAt).toISOString(), subjectId: subjectId.trim(), sourceId: sourceId.trim() };
}

function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') { if (quoted && text[index + 1] === '"') { field += '"'; index += 1; } else quoted = !quoted; }
    else if (character === "," && !quoted) { row.push(field); field = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) { if (character === "\r" && text[index + 1] === "\n") index += 1; row.push(field); rows.push(row); row = []; field = ""; }
    else field += character;
  }
  if (quoted) throw new Error("Health export CSV contains an unterminated quoted field");
  if (field || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function stringValue(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
