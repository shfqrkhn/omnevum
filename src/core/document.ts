import { inspectArtifact, type ArtifactAdapter } from "./artifact";

export const MAX_DOCUMENT_FINISH_TEXT_BYTES = 20_000;

export interface TextRedactionResult {
  sourceAdapter: Extract<ArtifactAdapter, "TEXT" | "HTML">;
  sourceSha256: string;
  fileName: string;
  mimeType: "text/plain";
  blob: Blob;
  redactedCount: number;
  warnings: string[];
}

export async function redactTextArtifact(
  blob: Blob,
  fileName: string,
  mimeType: string,
  terms: string[],
  replacement = "[REDACTED]",
  options: { signal?: AbortSignal } = {}
): Promise<TextRedactionResult> {
  throwIfAborted(options.signal);
  if (blob.size > MAX_DOCUMENT_FINISH_TEXT_BYTES) throw new Error("Text finishing is bounded to 20,000 bytes; the original Artifact remains unchanged");
  const inspection = await inspectArtifact(blob, fileName, mimeType, { maxBytes: MAX_DOCUMENT_FINISH_TEXT_BYTES, ...(options.signal ? { signal: options.signal } : {}) });
  throwIfAborted(options.signal);
  if (inspection.adapter !== "TEXT" && inspection.adapter !== "HTML") throw new Error("This local finisher supports only bounded text or inert HTML Artifacts");
  if (!inspection.derivedText || inspection.derivedText.truncated) throw new Error("The source text is truncated or empty; use a qualified document adapter before finishing it");

  const normalizedTerms = [...new Set(terms.map((term) => term.trim()).filter(Boolean))];
  if (normalizedTerms.length === 0 || normalizedTerms.length > 8 || normalizedTerms.some((term) => term.length > 240)) throw new Error("Provide between 1 and 8 redaction terms, each no longer than 240 characters");
  const normalizedReplacement = replacement.trim().slice(0, 80);
  if (!normalizedReplacement) throw new Error("A non-empty redaction replacement is required");

  const pattern = new RegExp(normalizedTerms.sort((left, right) => right.length - left.length).map(escapeRegExp).join("|"), "giu");
  let redactedCount = 0;
  const text = inspection.derivedText.text.replace(pattern, () => {
    redactedCount += 1;
    return normalizedReplacement;
  });
  if (redactedCount === 0) throw new Error("None of the redaction terms were found in the bounded source text");

  throwIfAborted(options.signal);
  const output = new Blob([text], { type: "text/plain" });
  if (output.size > MAX_DOCUMENT_FINISH_TEXT_BYTES) throw new Error("The derived text exceeds the bounded 20,000 byte output limit");
  return {
    sourceAdapter: inspection.adapter,
    sourceSha256: inspection.sha256,
    fileName: redactedFileName(fileName),
    mimeType: "text/plain",
    blob: output,
    redactedCount,
    warnings: inspection.warnings
  };
}

function redactedFileName(fileName: string): string {
  const safeName = fileName.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\.[^.]+$/, "").slice(0, 120) || "artifact";
  return `${safeName}.redacted.txt`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Document finishing was cancelled", "AbortError");
}
