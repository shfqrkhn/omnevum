import { sha256Hex } from "./artifact";
import type { CaptureKind, RecordType } from "./model";
import type { CommandBus } from "./commands";
import { scrubSensitiveValue } from "./safety";

export const MAX_ACQUIRE_BYTES = 5 * 1024 * 1024;
export const MAX_ACQUIRE_CANDIDATES = 500;
export const MAX_ACQUIRE_URL_LENGTH = 4096;

export type AcquireFormat = "TEXT" | "JSON" | "CSV" | "URL";

export interface AcquireSource {
  sourceId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  format: AcquireFormat;
  capturedAt: string;
}

export interface AcquireCandidate {
  candidateId: string;
  sourceId: string;
  sequence: number;
  recordType: RecordType;
  owner: string;
  kind: CaptureKind;
  data: Record<string, unknown>;
  confidence: "HIGH" | "REVIEW";
  reason: string;
}

export interface AcquirePreview {
  source: AcquireSource;
  candidates: AcquireCandidate[];
  warnings: string[];
}

export async function stageBlob(blob: Blob, name = "source", mimeType = blob.type || "application/octet-stream"): Promise<AcquirePreview> {
  if (blob.size > MAX_ACQUIRE_BYTES) throw new Error("Acquire source exceeds the bounded 5 MiB staging limit");
  const sourceText = await blob.text();
  const format = detectFormat(name, mimeType, sourceText);
  return stageText(sourceText, { name, mimeType, sizeBytes: blob.size, sha256: await sha256Hex(blob), format });
}

export async function stageText(text: string, input: { name?: string; mimeType?: string; sizeBytes?: number; sha256?: string; format?: AcquireFormat } = {}): Promise<AcquirePreview> {
  const encoded = new TextEncoder().encode(text);
  if (encoded.byteLength > MAX_ACQUIRE_BYTES) throw new Error("Acquire source exceeds the bounded 5 MiB staging limit");
  const capturedAt = new Date().toISOString();
  const digest = input.sha256 ?? await digestBytes(encoded);
  const name = input.name?.trim() || "pasted-source";
  const mimeType = input.mimeType?.trim() || "text/plain";
  const format = input.format ?? detectFormat(name, mimeType, text);
  const source = { sourceId: `source:${digest}`, name, mimeType, sizeBytes: input.sizeBytes ?? encoded.byteLength, sha256: digest, format, capturedAt } satisfies AcquireSource;
  const warnings: string[] = [];
  let rows: unknown[];
  try {
    rows = format === "JSON" ? parseJsonRows(text) : format === "CSV" ? parseCsvRows(text) : format === "URL" ? [{ text, url: text, kind: "url" }] : [{ text }];
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "Source parsing failed; retained as one text candidate");
    rows = [{ text }];
  }
  if (rows.length > MAX_ACQUIRE_CANDIDATES) {
    warnings.push(`Only the first ${MAX_ACQUIRE_CANDIDATES} candidates were staged`);
    rows = rows.slice(0, MAX_ACQUIRE_CANDIDATES);
  }
  const candidates = rows.map((row, index) => candidateFromRow(row, source, index + 1));
  return { source, candidates, warnings };
}

export async function stageUrl(url: string): Promise<AcquirePreview> {
  const trimmed = url.trim();
  if (new TextEncoder().encode(trimmed).byteLength > MAX_ACQUIRE_URL_LENGTH) throw new Error("Acquire URL exceeds the bounded 4 KiB limit");
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Acquire URL is invalid");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Acquire URL must use HTTP or HTTPS");
  if (parsed.username || parsed.password) throw new Error("Acquire URL must not contain embedded credentials");
  return stageText(parsed.href, { name: parsed.href, mimeType: "text/uri-list", format: "URL" });
}

export async function acceptCandidate(commands: CommandBus, candidate: AcquireCandidate): Promise<{ accepted: boolean; id?: string }> {
  const existing = await commands.findBySourceId(candidate.sourceId);
  if (existing.length > 0) return existing[0] ? { accepted: false, id: existing[0].id } : { accepted: false };
  const record = await commands.create({
    recordType: candidate.recordType,
    owner: candidate.owner,
    truthClass: "IMPORTED_RECORD",
    data: candidate.data,
    provenance: { source: "IMPORT", sourceId: candidate.sourceId }
  });
  return { accepted: true, id: record.id };
}

export async function acceptCandidates(commands: CommandBus, candidates: AcquireCandidate[]): Promise<{ accepted: number; skipped: number; ids: string[] }> {
  let accepted = 0;
  let skipped = 0;
  const ids: string[] = [];
  for (const candidate of candidates) {
    const result = await acceptCandidate(commands, candidate);
    if (result.accepted) accepted += 1;
    else skipped += 1;
    if (result.id) ids.push(result.id);
  }
  return { accepted, skipped, ids };
}

function candidateFromRow(row: unknown, source: AcquireSource, sequence: number): AcquireCandidate {
  const object = typeof row === "object" && row !== null && !Array.isArray(row) ? row as Record<string, unknown> : { value: row };
  const rawType = typeof object.type === "string" ? object.type.toLowerCase() : "";
  const rawKind = typeof object.kind === "string" ? object.kind.toLowerCase() : "";
  const recordType: RecordType = rawType === "artifact" || ["file", "image", "source"].includes(rawKind) ? "artifact" : rawType === "task" || rawKind === "task" ? "task" : rawType === "observation" || rawType === "measurement" || ["measurement", "workout", "expense", "event", "place", "location"].includes(rawType) || ["measurement", "workout", "expense", "event", "place", "location"].includes(rawKind) ? "observation" : "note";
  const kind = captureKind(object, recordType);
  const text = firstText(object) ?? JSON.stringify(row) ?? "Imported record";
  const sourceFields = scrubSensitiveValue(Object.fromEntries(Object.entries(object).slice(0, 50))) as Record<string, unknown>;
  const data: Record<string, unknown> = {
    text: text.slice(0, 5000),
    kind,
    sourceId: source.sourceId,
    sourceSequence: sequence,
    sourceFields,
    triageStatus: "INBOX",
    ...(recordType === "task" ? { status: "OPEN" } : {})
  };
  return {
    candidateId: `${source.sourceId}:${sequence}`,
    sourceId: `${source.sourceId}:${sequence}`,
    sequence,
    recordType,
    owner: ownerForRow(object, kind),
    kind,
    data,
    confidence: rawType || typeof object.text === "string" ? "HIGH" : "REVIEW",
    reason: rawType ? "recognized record type" : "type requires user review"
  };
}

function captureKind(object: Record<string, unknown>, recordType: RecordType): CaptureKind {
  const kind = typeof object.kind === "string" ? object.kind.toLowerCase() : "";
  if (["expense", "measurement", "workout", "event", "person", "goal", "decision", "url", "voice", "file", "image", "source", "note", "task", "observation"].includes(kind)) return kind as CaptureKind;
  if (recordType === "artifact") return "file";
  if (recordType === "relationship") return "note";
  return recordType;
}

function ownerForKind(kind: CaptureKind): string {
  if (kind === "measurement" || kind === "workout") return "platform.track";
  if (kind === "event") return "platform.time";
  if (kind === "file" || kind === "image" || kind === "source") return "platform.artifact";
  return "core.acquire";
}

function ownerForRow(object: Record<string, unknown>, kind: CaptureKind): string {
  const declared = [object.type, object.kind].find((value): value is string => typeof value === "string")?.toLowerCase();
  if (declared === "event") return "platform.time";
  if (declared === "place" || declared === "location") return "platform.place";
  return ownerForKind(kind);
}

function firstText(object: Record<string, unknown>): string | undefined {
  for (const key of ["text", "content", "title", "name", "description", "value"]) {
    if (typeof object[key] === "string" && object[key].trim()) return object[key].trim();
  }
  return undefined;
}

function parseJsonRows(text: string): unknown[] {
  const value: unknown = JSON.parse(text);
  if (Array.isArray(value)) return value;
  if (typeof value === "object" && value !== null && Array.isArray((value as Record<string, unknown>).records)) return (value as { records: unknown[] }).records;
  return [value];
}

function parseCsvRows(text: string): unknown[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const [header, ...body] = rows;
  if (!header || header.length === 0) return [];
  return body.map((values) => Object.fromEntries(header.map((key, index) => [key.trim() || `column${index + 1}`, values[index] ?? ""])));
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (const character of text) {
    if (character === '"') {
      if (quoted && field.endsWith('"')) field = field.slice(0, -1) + '"';
      else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r") continue;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += character;
    if (field.length > 10000) throw new Error("CSV field exceeded the bounded 10,000 character limit");
  }
  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((candidate) => candidate.some((value) => value.trim()));
}

function detectFormat(name: string, mimeType: string, text: string): AcquireFormat {
  const lowerName = name.toLowerCase();
  const lowerMime = mimeType.toLowerCase();
  if (lowerName.startsWith("http://") || lowerName.startsWith("https://") || lowerMime === "text/uri-list") return "URL";
  if (lowerName.endsWith(".json") || lowerMime.includes("json")) return "JSON";
  if (lowerName.endsWith(".csv") || lowerMime.includes("csv")) return "CSV";
  try {
    JSON.parse(text);
    return "JSON";
  } catch {
    return "TEXT";
  }
}

async function digestBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
