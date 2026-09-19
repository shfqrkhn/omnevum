export const MAX_ANALYTICAL_BYTES = 32 * 1024 * 1024;
export const MAX_ANALYTICAL_ROWS = 100_000;
export const MAX_ANALYTICAL_COLUMNS = 200;

export type AnalyticalFormat = "CSV" | "JSON" | "PARQUET";
export type AnalyticalScalar = string | number | boolean | null;

export interface AnalyticalCapability {
  engineId: "omnevum-local-tabular-v1";
  format: AnalyticalFormat;
  status: "SUPPORTED_WITH_LIMITS" | "PLATFORM_LIMITED";
  remoteFetch: "DISABLED";
  notes: string;
}

export interface AnalyticalProjection {
  format: "OMNEVUM_ANALYTICAL_PROJECTION";
  version: 1;
  sourceId: string;
  sourceFormat: Exclude<AnalyticalFormat, "PARQUET">;
  columns: string[];
  rows: Record<string, AnalyticalScalar>[];
  derived: true;
  canonicalOwner: "NONE";
  remoteFetch: "DISABLED";
}

export type AnalyticalFilter = { column: string; operator: "EQ" | "CONTAINS" | "GT" | "GTE" | "LT" | "LTE"; value: AnalyticalScalar };

export interface AnalyticalQuery {
  select: string[];
  filters?: AnalyticalFilter[];
  limit?: number;
}

export interface AnalyticalQueryResult {
  kind: "DERIVED_ANALYTICAL_RESULT";
  sourceId: string;
  columns: string[];
  rows: Record<string, AnalyticalScalar>[];
  scannedRows: number;
  remoteFetch: "DISABLED";
}

export function characterizeAnalyticalFormat(format: AnalyticalFormat): AnalyticalCapability {
  if (format === "PARQUET") return { engineId: "omnevum-local-tabular-v1", format, status: "PLATFORM_LIMITED", remoteFetch: "DISABLED", notes: "Parquet requires a separately qualified browser analytical engine and local runtime assets; no remote extension or data fetch is attempted." };
  return { engineId: "omnevum-local-tabular-v1", format, status: "SUPPORTED_WITH_LIMITS", remoteFetch: "DISABLED", notes: "Bounded local CSV/JSON projection; no analytical engine, network fetch, or canonical ownership is admitted." };
}

export function projectLocalTabular(text: string, format: Exclude<AnalyticalFormat, "PARQUET">, sourceId: string): AnalyticalProjection {
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > MAX_ANALYTICAL_BYTES) throw new Error("Analytical source exceeds the bounded 32 MiB limit");
  if (!sourceId.trim() || sourceId.length > 240) throw new Error("Analytical source identity is invalid");
  const rows = format === "CSV" ? parseCsv(text) : parseJson(text);
  if (rows.length === 0) throw new Error("Analytical source contains no rows");
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].sort();
  if (columns.length === 0 || columns.length > MAX_ANALYTICAL_COLUMNS) throw new Error("Analytical columns are outside the supported bound");
  return { format: "OMNEVUM_ANALYTICAL_PROJECTION", version: 1, sourceId: sourceId.trim(), sourceFormat: format, columns, rows, derived: true, canonicalOwner: "NONE", remoteFetch: "DISABLED" };
}

export function queryAnalyticalProjection(projection: AnalyticalProjection, query: AnalyticalQuery, signal?: AbortSignal): AnalyticalQueryResult {
  if (query.select.length === 0 || query.select.some((column) => !projection.columns.includes(column))) throw new Error("Analytical query selects an unknown column");
  const limit = query.limit ?? 10_000;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_ANALYTICAL_ROWS) throw new Error("Analytical query limit is outside the supported bound");
  const filters = query.filters ?? [];
  if (filters.some((filter) => !projection.columns.includes(filter.column))) throw new Error("Analytical filter selects an unknown column");
  const rows: Record<string, AnalyticalScalar>[] = [];
  let scannedRows = 0;
  for (const row of projection.rows) {
    throwIfAborted(signal);
    scannedRows += 1;
    if (!filters.every((filter) => matchesFilter(row[filter.column] ?? null, filter))) continue;
    rows.push(Object.fromEntries(query.select.map((column) => [column, row[column] ?? null])));
    if (rows.length >= limit) break;
  }
  return { kind: "DERIVED_ANALYTICAL_RESULT", sourceId: projection.sourceId, columns: [...query.select], rows, scannedRows, remoteFetch: "DISABLED" };
}

function parseJson(text: string): Record<string, AnalyticalScalar>[] {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error("Analytical JSON is invalid"); }
  const values = Array.isArray(parsed) ? parsed : [parsed];
  if (values.length > MAX_ANALYTICAL_ROWS) throw new Error("Analytical rows exceed the supported bound");
  return values.map((value) => normalizeRow(value));
}

function parseCsv(text: string): Record<string, AnalyticalScalar>[] {
  const rows = parseCsvRows(text);
  const headers = rows.shift() ?? [];
  if (headers.length === 0 || headers.some((header) => !header.trim()) || new Set(headers).size !== headers.length) throw new Error("Analytical CSV headers are invalid");
  if (rows.length > MAX_ANALYTICAL_ROWS) throw new Error("Analytical rows exceed the supported bound");
  return rows.filter((row) => row.some((value) => value !== "")).map((row) => normalizeRow(Object.fromEntries(headers.map((header, index) => [header, parseCsvScalar(row[index] ?? "")] ))));
}

function parseCsvRows(text: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) { row.push(field); field = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field); result.push(row); row = []; field = "";
    } else field += character;
  }
  if (quoted) throw new Error("Analytical CSV contains an unterminated quoted field");
  if (field.length > 0 || row.length > 0) { row.push(field); result.push(row); }
  return result;
}

function normalizeRow(value: unknown): Record<string, AnalyticalScalar> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Analytical rows must be objects");
  const row: Record<string, AnalyticalScalar> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,120}$/u.test(key)) throw new Error("Analytical column name is invalid");
    if (raw === null || typeof raw === "string" || typeof raw === "boolean") row[key] = raw;
    else if (typeof raw === "number" && Number.isFinite(raw)) row[key] = raw;
    else throw new Error("Analytical values must be scalar");
  }
  return row;
}

function parseCsvScalar(value: string): AnalyticalScalar {
  const normalized = value.trim();
  if (normalized === "") return null;
  if (normalized === "true" || normalized === "false") return normalized === "true";
  const number = Number(normalized);
  return normalized !== "" && Number.isFinite(number) ? number : value;
}

function matchesFilter(value: AnalyticalScalar, filter: AnalyticalFilter): boolean {
  const expected = filter.value;
  if (filter.operator === "EQ") return value === expected;
  if (filter.operator === "CONTAINS") return typeof value === "string" && typeof expected === "string" && value.toLocaleLowerCase("en-CA").includes(expected.toLocaleLowerCase("en-CA"));
  if (typeof value !== "number" || typeof expected !== "number") return false;
  if (filter.operator === "GT") return value > expected;
  if (filter.operator === "GTE") return value >= expected;
  if (filter.operator === "LT") return value < expected;
  return value <= expected;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Analytical query cancelled", "AbortError");
}
