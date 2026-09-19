import type { SpaceId } from "./domain";

export const MAX_PORTABLE_ARTIFACT_BYTES = 10 * 1024 * 1024;
export const MAX_ARTIFACT_INSPECTION_BYTES = 1024 * 1024;

export type ArtifactAdapter = "TEXT" | "JSON" | "CSV" | "GPX" | "HTML" | "PDF" | "SPREADSHEET" | "IMAGE" | "BINARY";
export type ArtifactAdapterStatus = "SUPPORTED" | "BOUNDED" | "UNSUPPORTED";
export type ArtifactOcrStatus = "NOT_APPLICABLE" | "NOT_CONFIGURED";

export interface DerivedArtifactText {
  truthClass: "DERIVED";
  operation: "safe-text-extraction";
  text: string;
  truncated: boolean;
}

export interface ArtifactInspection {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  adapter: ArtifactAdapter;
  adapterStatus: ArtifactAdapterStatus;
  ocr: ArtifactOcrStatus;
  metadata: Record<string, string | number | boolean>;
  derivedText?: DerivedArtifactText;
  warnings: string[];
}

export interface SpreadsheetSafetyReport {
  formulaCells: number;
  externalResourceCells: number;
  markupCells: number;
  activeContent: boolean;
  transformations: string[];
  lossless: boolean;
}

export interface ArtifactInput {
  fileName: string;
  mimeType: string;
  blob: Blob;
  space?: SpaceId;
  sourceId?: string;
  adapter?: ArtifactAdapter;
  metadata?: Record<string, unknown>;
  derivedText?: DerivedArtifactText;
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function inspectArtifact(blob: Blob, fileName = "artifact", mimeType = blob.type || "application/octet-stream", options: { signal?: AbortSignal; maxBytes?: number } = {}): Promise<ArtifactInspection> {
  if (blob.size > MAX_PORTABLE_ARTIFACT_BYTES) throw new Error("Artifact exceeds the bounded 10 MiB intake limit");
  throwIfAborted(options.signal);
  const maxBytes = Math.min(options.maxBytes ?? MAX_ARTIFACT_INSPECTION_BYTES, MAX_ARTIFACT_INSPECTION_BYTES);
  const prefix = new Uint8Array(await blob.slice(0, maxBytes).arrayBuffer());
  throwIfAborted(options.signal);
  const sha256 = await sha256Hex(blob);
  throwIfAborted(options.signal);
  const normalizedName = fileName.trim() || "artifact";
  const normalizedMimeType = mimeType.trim().toLowerCase() || "application/octet-stream";
  const adapter = detectArtifactAdapter(normalizedName, normalizedMimeType, prefix);
  const warnings: string[] = [];
  if (blob.size > prefix.byteLength) warnings.push(`Inspection was bounded to ${MAX_ARTIFACT_INSPECTION_BYTES} bytes; the original artifact remains intact.`);

  let metadata: Record<string, string | number | boolean> = {};
  let derivedText: DerivedArtifactText | undefined;
  let adapterStatus: ArtifactAdapterStatus = adapter === "BINARY" ? "UNSUPPORTED" : "SUPPORTED";
  if (adapter === "PDF") {
    metadata = inspectPdf(prefix, warnings);
    adapterStatus = "BOUNDED";
  } else if (adapter === "SPREADSHEET") {
    const report = inspectSpreadsheetSafety(decodeLatin1(prefix), true);
    metadata = spreadsheetMetadata(report);
    appendSpreadsheetWarnings(report, warnings);
    adapterStatus = "BOUNDED";
  } else if (adapter === "IMAGE") {
    metadata = inspectImage(prefix, normalizedMimeType, warnings);
    adapterStatus = "BOUNDED";
  } else if (adapter === "HTML") {
    const html = decodeUtf8(prefix);
    const activeContent = /<\s*(script|style|iframe|object|embed|svg|form|base)\b/i.test(html);
    if (activeContent) warnings.push("Active HTML content was stripped; extracted text is inert and was never executed.");
    derivedText = makeDerivedText(inertTextFromHtml(html), blob.size > prefix.byteLength);
    metadata = { extractedTextBytes: derivedText ? new TextEncoder().encode(derivedText.text).byteLength : 0, activeContentStripped: activeContent };
    adapterStatus = "BOUNDED";
  } else if (adapter === "TEXT" || adapter === "JSON" || adapter === "CSV" || adapter === "GPX") {
    const text = decodeUtf8(prefix);
    derivedText = makeDerivedText(text, blob.size > prefix.byteLength);
    if (adapter === "CSV") {
      const report = inspectSpreadsheetSafety(text, false);
      metadata = { extractedTextBytes: derivedText ? new TextEncoder().encode(derivedText.text).byteLength : 0, ...spreadsheetMetadata(report) };
      appendSpreadsheetWarnings(report, warnings);
    } else metadata = { extractedTextBytes: derivedText ? new TextEncoder().encode(derivedText.text).byteLength : 0 };
    adapterStatus = blob.size > prefix.byteLength ? "BOUNDED" : "SUPPORTED";
  } else {
    warnings.push("No safe browser-native adapter is configured for this binary format; the original bytes remain available as an Artifact.");
  }
  return {
    fileName: normalizedName,
    mimeType: normalizedMimeType,
    sizeBytes: blob.size,
    sha256,
    adapter,
    adapterStatus,
    ocr: adapter === "PDF" || adapter === "IMAGE" ? "NOT_CONFIGURED" : "NOT_APPLICABLE",
    metadata,
    ...(derivedText ? { derivedText } : {}),
    warnings
  };
}

function detectArtifactAdapter(fileName: string, mimeType: string, bytes: Uint8Array): ArtifactAdapter {
  const lowerName = fileName.toLowerCase();
  if (hasPrefix(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]) || mimeType === "application/pdf" || lowerName.endsWith(".pdf")) return "PDF";
  if (isSpreadsheetFile(lowerName, mimeType)) return "SPREADSHEET";
  if (isImageBytes(bytes) || mimeType.startsWith("image/") || /\.(?:png|jpe?g|gif|webp|avif|bmp|heic)$/i.test(lowerName)) return "IMAGE";
  if (mimeType.includes("html") || /\.html?$/i.test(lowerName) || /^\s*<!doctype\s+html|^\s*<html\b/i.test(decodeUtf8(bytes))) return "HTML";
  if (mimeType.includes("json") || lowerName.endsWith(".json")) return "JSON";
  if (mimeType.includes("csv") || mimeType.includes("tab-separated") || lowerName.endsWith(".csv") || lowerName.endsWith(".tsv")) return "CSV";
  if (mimeType.includes("gpx") || lowerName.endsWith(".gpx") || /<gpx\b/i.test(decodeUtf8(bytes))) return "GPX";
  if (mimeType.startsWith("text/") || isLikelyText(bytes)) return "TEXT";
  return "BINARY";
}

function isSpreadsheetFile(fileName: string, mimeType: string): boolean {
  return /\.(?:xls|xlsx|xlsm|xlsb|ods)$/i.test(fileName) || /spreadsheet|excel|opendocument\.spreadsheet|ms-excel/u.test(mimeType);
}

export function inspectSpreadsheetSafety(source: string, binary = false): SpreadsheetSafetyReport {
  const formulaCells = binary
    ? [...source.matchAll(/<f(?:\s|>)/gi)].length
    : source.split(/\r?\n/u).flatMap((row) => row.split(/\t|,/u)).filter((cell) => /^\s*(?:=|\+|@|-(?=[A-Za-z(]))/u.test(cell)).length;
  const externalResourceCells = [...source.matchAll(/(?:https?:\/\/|file:\/\/|\\\\|externalLink)/giu)].length;
  const markupCells = [...source.matchAll(/<\s*(?:script|iframe|object|embed|svg|form|html|a)\b|\bon\w+\s*=/giu)].length;
  const activeContent = /(?:vbaProject\.bin|\bmacro\b|\bjavascript:|\bDDE\b|\bWEBSERVICE\b|\bPowerQuery\b)/iu.test(source);
  return {
    formulaCells,
    externalResourceCells,
    markupCells,
    activeContent,
    transformations: [],
    lossless: true
  };
}

function spreadsheetMetadata(report: SpreadsheetSafetyReport): Record<string, string | number | boolean> {
  return {
    spreadsheetFormulaCells: report.formulaCells,
    spreadsheetExternalResourceCells: report.externalResourceCells,
    spreadsheetMarkupCells: report.markupCells,
    spreadsheetActiveContentRejected: report.activeContent,
    spreadsheetRoundTripLossless: report.lossless,
    spreadsheetTransformations: report.transformations.length === 0 ? "none; original artifact retained" : report.transformations.join("; ")
  };
}

function appendSpreadsheetWarnings(report: SpreadsheetSafetyReport, warnings: string[]): void {
  if (report.formulaCells > 0) warnings.push("Spreadsheet formula/control prefixes were retained as inert source text; no formula was evaluated.");
  if (report.activeContent) warnings.push("Spreadsheet active content was detected and was not executed.");
  if (report.externalResourceCells > 0) warnings.push("Spreadsheet external links/resources were retained as inert source text; no network fetch was attempted.");
  if (report.markupCells > 0) warnings.push("Spreadsheet markup was retained as inert source text; no script or markup was executed.");
}

function inspectPdf(bytes: Uint8Array, warnings: string[]): Record<string, string | number | boolean> {
  const source = decodeLatin1(bytes);
  const pageCount = [...source.matchAll(/\/Type\s*\/Page\b/g)].length;
  const activeContent = /\/(?:JavaScript|JS|OpenAction|AA)\b/i.test(source);
  if (activeContent) warnings.push("PDF active actions were detected and were not executed.");
  const title = extractPdfString(source, "Title");
  const author = extractPdfString(source, "Author");
  return {
    ...(pageCount ? { pageCount } : {}),
    ...(title ? { title } : {}),
    ...(author ? { author } : {}),
    ...(activeContent ? { activeContentRejected: true } : {})
  };
}

function inspectImage(bytes: Uint8Array, mimeType: string, warnings: string[]): Record<string, string | number | boolean> {
  const dimensions = imageDimensions(bytes);
  if (!dimensions) warnings.push("Image metadata header was not recognized; pixels were not decoded.");
  return {
    ...(dimensions ? { width: dimensions.width, height: dimensions.height } : {}),
    ...(mimeType ? { declaredMimeType: mimeType } : {}),
    pixelsDecoded: false
  };
}

function imageDimensions(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) && bytes.length >= 24) {
    const width = readUint32(bytes, 16);
    const height = readUint32(bytes, 20);
    return width > 0 && height > 0 ? { width, height } : undefined;
  }
  if ((hasPrefix(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || hasPrefix(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) && bytes.length >= 10) {
    const width = (bytes[6] ?? 0) | ((bytes[7] ?? 0) << 8);
    const height = (bytes[8] ?? 0) | ((bytes[9] ?? 0) << 8);
    return width > 0 && height > 0 ? { width, height } : undefined;
  }
  if (hasPrefix(bytes, [0x52, 0x49, 0x46, 0x46]) && hasPrefix(bytes.slice(8), [0x57, 0x45, 0x42, 0x50]) && bytes.length >= 30 && hasPrefix(bytes.slice(12), [0x56, 0x50, 0x38, 0x58])) {
    const width = 1 + (bytes[24] ?? 0) + ((bytes[25] ?? 0) << 8) + ((bytes[26] ?? 0) << 16);
    const height = 1 + (bytes[27] ?? 0) + ((bytes[28] ?? 0) << 8) + ((bytes[29] ?? 0) << 16);
    return width > 0 && height > 0 ? { width, height } : undefined;
  }
  if (hasPrefix(bytes, [0xff, 0xd8])) return jpegDimensions(bytes);
  return undefined;
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | undefined {
  let offset = 2;
  while (offset + 9 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1] ?? 0;
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
    if (length < 2 || offset + length > bytes.length) break;
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      const height = ((bytes[offset + 3] ?? 0) << 8) | (bytes[offset + 4] ?? 0);
      const width = ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0);
      return width > 0 && height > 0 ? { width, height } : undefined;
    }
    offset += length;
  }
  return undefined;
}

function extractPdfString(source: string, key: string): string | undefined {
  const value = new RegExp(`\\/${key}\\s*\\(([^)]{1,240})\\)`, "i").exec(source)?.[1];
  return value?.replaceAll("\\)", ")").replaceAll("\\(", "(").trim() || undefined;
}

function makeDerivedText(text: string, truncated: boolean): DerivedArtifactText | undefined {
  const normalized = text.trim().slice(0, 20_000);
  return normalized ? { truthClass: "DERIVED", operation: "safe-text-extraction", text: normalized, truncated: truncated || text.length > normalized.length } : undefined;
}

function inertTextFromHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\s*(script|style|iframe|object|embed|svg|form|base)\b[\s\S]*?<\/\s*\1\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function decodeLatin1(bytes: Uint8Array): string {
  return new TextDecoder("windows-1252", { fatal: false }).decode(bytes);
}

function isImageBytes(bytes: Uint8Array): boolean {
  return hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47]) || hasPrefix(bytes, [0xff, 0xd8, 0xff]) || hasPrefix(bytes, [0x47, 0x49, 0x46]) || hasPrefix(bytes, [0x52, 0x49, 0x46, 0x46]) && hasPrefix(bytes.slice(8), [0x57, 0x45, 0x42, 0x50]);
}

function isLikelyText(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false;
  const decoded = decodeUtf8(bytes);
  if (!decoded) return false;
  const replacementCount = [...decoded].filter((character) => character === "�").length;
  return replacementCount <= Math.max(1, Math.floor(decoded.length / 100));
}

function hasPrefix(bytes: Uint8Array, prefix: number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (((bytes[offset] ?? 0) << 24) >>> 0) + ((bytes[offset + 1] ?? 0) << 16) + ((bytes[offset + 2] ?? 0) << 8) + (bytes[offset + 3] ?? 0);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Artifact inspection was cancelled", "AbortError");
}
