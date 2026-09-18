import type { CommandBus } from "./commands";
import type { CanonicalRecord } from "./model";

export interface TextAnchor {
  quote: string;
  start?: number;
  end?: number;
  sourceRevision: number;
}

export type AnchorState = "ACTIVE" | "STALE" | "ORPHANED";

export interface AnnotationInput {
  sourceId: string;
  sourceRevision: number;
  quote: string;
  note: string;
  start?: number;
  end?: number;
}

export async function createTextAnnotation(commands: CommandBus, input: AnnotationInput): Promise<CanonicalRecord> {
  if (!input.sourceId || !input.quote.trim() || !input.note.trim()) throw new Error("Annotation source, quote, and note are required");
  return commands.create({
    recordType: "note",
    owner: "platform.annotate",
    data: { kind: "text-annotation", sourceId: input.sourceId, anchor: { quote: input.quote.slice(0, 1000), ...(input.start === undefined ? {} : { start: input.start }), ...(input.end === undefined ? {} : { end: input.end }), sourceRevision: input.sourceRevision } satisfies TextAnchor, text: input.note.trim().slice(0, 5000), anchorState: "ACTIVE", triageStatus: "REVIEWED" }
  });
}

export function assessTextAnchor(annotation: CanonicalRecord, currentSourceText: string, currentRevision: number): AnchorState {
  if (annotation.data.kind !== "text-annotation" || typeof annotation.data.anchor !== "object" || annotation.data.anchor === null) return "ORPHANED";
  const anchor = annotation.data.anchor as Partial<TextAnchor>;
  if (typeof anchor.quote !== "string" || !anchor.quote) return "ORPHANED";
  if (anchor.start !== undefined && anchor.end !== undefined && currentSourceText.slice(anchor.start, anchor.end) === anchor.quote && anchor.sourceRevision === currentRevision) return "ACTIVE";
  return currentSourceText.includes(anchor.quote) ? "STALE" : "ORPHANED";
}
