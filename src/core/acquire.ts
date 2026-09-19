import { inspectArtifact, type ArtifactAdapter, type ArtifactInspection, type DerivedArtifactText } from "./artifact";
import type { CaptureKind, RecordType } from "./model";
import type { CommandBus } from "./commands";
import { scrubSensitiveValue } from "./safety";

export const MAX_ACQUIRE_BYTES = 5 * 1024 * 1024;
export const MAX_ACQUIRE_CANDIDATES = 500;
export const MAX_ACQUIRE_URL_LENGTH = 4096;

export type AcquireFormat = "TEXT" | "JSON" | "CSV" | "URL" | "GPX" | "HTML" | "PDF" | "SPREADSHEET" | "IMAGE" | "BINARY";

export interface AcquireSource {
  sourceId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  format: AcquireFormat;
  capturedAt: string;
  adapter?: ArtifactAdapter;
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
  artifact?: {
    fileName: string;
    mimeType: string;
    blob: Blob;
    adapter: ArtifactAdapter;
    metadata: Record<string, string | number | boolean>;
    derivedText?: DerivedArtifactText;
  };
}

export interface AcquirePreview {
  source: AcquireSource;
  candidates: AcquireCandidate[];
  warnings: string[];
}

export async function stageBlob(blob: Blob, name = "source", mimeType = blob.type || "application/octet-stream", signal?: AbortSignal): Promise<AcquirePreview> {
  if (blob.size > MAX_ACQUIRE_BYTES) throw new Error("Acquire source exceeds the bounded 5 MiB staging limit");
  const inspection = await inspectArtifact(blob, name, mimeType, signal ? { signal, maxBytes: MAX_ACQUIRE_BYTES } : { maxBytes: MAX_ACQUIRE_BYTES });
  if (inspection.adapter === "PDF" || inspection.adapter === "SPREADSHEET" || inspection.adapter === "IMAGE" || inspection.adapter === "HTML" || inspection.adapter === "BINARY") return stageInspectedArtifact(inspection, blob);
  const sourceText = await blob.text();
  const format = inspection.adapter === "TEXT" || inspection.adapter === "JSON" || inspection.adapter === "CSV" || inspection.adapter === "GPX" ? inspection.adapter : detectFormat(name, mimeType, sourceText);
  return stageText(sourceText, { name, mimeType, sizeBytes: blob.size, sha256: inspection.sha256, format });
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
    rows = format === "JSON" ? parseJsonRows(text) : format === "CSV" ? parseCsvRows(text) : format === "GPX" ? parseGpxRows(text) : format === "URL" ? [{ text, url: text, kind: "url" }] : [{ text }];
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
  if (candidate.recordType === "artifact" && candidate.artifact) {
    const record = await commands.createArtifact({
      fileName: candidate.artifact.fileName,
      mimeType: candidate.artifact.mimeType,
      blob: candidate.artifact.blob,
      sourceId: candidate.sourceId,
      adapter: candidate.artifact.adapter,
      metadata: candidate.artifact.metadata,
      ...(candidate.artifact.derivedText ? { derivedText: candidate.artifact.derivedText } : {})
    });
    return { accepted: true, id: record.id };
  }
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
  const latitude = numericField(object.latitude);
  const longitude = numericField(object.longitude);
  const start = typeof object.start === "string" && object.start.trim() ? object.start.trim().slice(0, 80) : undefined;
  const data: Record<string, unknown> = {
    text: text.slice(0, 5000),
    kind,
    sourceId: source.sourceId,
    sourceSequence: sequence,
    sourceFields,
    triageStatus: "INBOX",
    ...(latitude !== undefined && longitude !== undefined ? { latitude, longitude } : {}),
    ...(start ? { start } : {}),
    ...(recordType === "task" ? { status: "OPEN" } : {})
  };
  if (recordType === "artifact" && typeof object.artifactAdapter === "string") {
    data.artifactAdapter = object.artifactAdapter;
    data.adapterStatus = typeof object.adapterStatus === "string" ? object.adapterStatus : "UNKNOWN";
    data.artifactMetadata = scrubSensitiveValue(object.artifactMetadata);
    if (object.derivedExtraction && typeof object.derivedExtraction === "object") data.derivedExtraction = scrubSensitiveValue(object.derivedExtraction);
  }
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

function stageInspectedArtifact(inspection: ArtifactInspection, blob: Blob): AcquirePreview {
  const source: AcquireSource = {
    sourceId: `source:${inspection.sha256}`,
    name: inspection.fileName,
    mimeType: inspection.mimeType,
    sizeBytes: inspection.sizeBytes,
    sha256: inspection.sha256,
    format: inspection.adapter,
    capturedAt: new Date().toISOString(),
    adapter: inspection.adapter
  };
  const candidate = candidateFromRow({
    type: "artifact",
    kind: inspection.adapter === "IMAGE" ? "image" : "file",
    name: inspection.fileName,
    mimeType: inspection.mimeType,
    artifactAdapter: inspection.adapter,
    adapterStatus: inspection.adapterStatus,
    artifactMetadata: inspection.metadata,
    ...(inspection.derivedText ? { derivedExtraction: inspection.derivedText } : {})
  }, source, 1);
  candidate.artifact = {
    fileName: inspection.fileName,
    mimeType: inspection.mimeType,
    blob,
    adapter: inspection.adapter,
    metadata: inspection.metadata,
    ...(inspection.derivedText ? { derivedText: inspection.derivedText } : {})
  };
  return { source, candidates: [candidate], warnings: inspection.warnings };
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

function parseGpxRows(text: string): unknown[] {
  const rows: unknown[] = [];
  const pointPattern = /<(wpt|trkpt)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
  let match: RegExpExecArray | null;
  while ((match = pointPattern.exec(text)) !== null && rows.length < MAX_ACQUIRE_CANDIDATES) {
    const tag = match[1]?.toLowerCase();
    const attributes = match[2] ?? "";
    const body = match[3] ?? "";
    const latitude = Number(attributeValue(attributes, "lat"));
    const longitude = Number(attributeValue(attributes, "lon"));
    if (!validCoordinate(latitude, longitude)) continue;
    if (tag === "wpt") {
      rows.push({ type: "location", kind: "location", name: elementText(body, "name") ?? `GPX waypoint ${rows.length + 1}`, latitude, longitude, source: "GPX_WAYPOINT" });
    } else {
      rows.push({ type: "event", kind: "event", title: `GPX track point ${rows.length + 1}`, start: elementText(body, "time"), latitude, longitude, source: "GPX_TRACKPOINT" });
    }
  }
  if (rows.length === 0) throw new Error("GPX contained no bounded waypoint or track point");
  return rows;
}

function attributeValue(attributes: string, name: string): string | undefined {
  return new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i").exec(attributes)?.[1];
}

function elementText(body: string, name: string): string | undefined {
  const value = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}\\s*>`, "i").exec(body)?.[1];
  return value?.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim().slice(0, 240) || undefined;
}

function validCoordinate(latitude: number, longitude: number): boolean {
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

function numericField(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function detectFormat(name: string, mimeType: string, text: string): AcquireFormat {
  const lowerName = name.toLowerCase();
  const lowerMime = mimeType.toLowerCase();
  if (lowerName.startsWith("http://") || lowerName.startsWith("https://") || lowerMime === "text/uri-list") return "URL";
  if (lowerName.endsWith(".json") || lowerMime.includes("json")) return "JSON";
  if (lowerName.endsWith(".csv") || lowerMime.includes("csv")) return "CSV";
  if (lowerName.endsWith(".gpx") || lowerMime.includes("gpx") || /<gpx\b/i.test(text)) return "GPX";
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
