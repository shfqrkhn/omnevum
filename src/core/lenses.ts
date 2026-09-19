import { recordSpace } from "./domain";
import { PRESENTATION_LENS_IDS, type PresentationLensId } from "./presentation";
import type { CanonicalRecord } from "./model";

export interface PresentationLensDefinition {
  id: PresentationLensId;
  label: string;
  description: string;
}

export const PRESENTATION_LENS_DEFINITIONS: Record<PresentationLensId, PresentationLensDefinition> = {
  direction: { id: "direction", label: "Direction", description: "Goals, decisions, tasks, and deliberate next steps." },
  people: { id: "people", label: "People", description: "Records about a person or an explicitly identified subject." },
  self: { id: "self", label: "Self", description: "Personal observations and notes owned by the local user." },
  resources: { id: "resources", label: "Resources", description: "Artifacts, expenses, measurements, and reusable inputs." },
  work: { id: "work", label: "Work", description: "Records explicitly scoped to the Work Space." },
  environment: { id: "environment", label: "Environment", description: "Places, location-shaped captures, and environmental observations." },
  knowledge: { id: "knowledge", label: "Knowledge", description: "Sources, artifacts, annotations, evidence, and references." },
  change: { id: "change", label: "Change", description: "Events, completed work, measurements, and records with revision history." }
};

const kindOf = (record: CanonicalRecord): string => typeof record.data.kind === "string" ? record.data.kind.toLowerCase() : "";
const DIRECTION_KINDS = new Set(["goal", "decision", "event", "reminder"]);
const RESOURCE_KINDS = new Set(["expense", "measurement", "health-measurement", "tracker-definition", "tracker-observation", "workout", "file", "image", "source", "url", "voice"]);
const ENVIRONMENT_KINDS = new Set(["place", "location", "geolocation", "environment", "workout"]);
const KNOWLEDGE_KINDS = new Set(["source", "annotation", "text-annotation", "evidence-link", "claim"]);
const CHANGE_KINDS = new Set(["event", "decision", "change", "measurement", "health-measurement", "tracker-observation"]);

export function lensIdsForRecord(record: CanonicalRecord): PresentationLensId[] {
  if (record.deleted || record.owner === "platform.space" || kindOf(record) === "cleanup-history") return [];
  const kind = kindOf(record);
  const ids = new Set<PresentationLensId>();
  if (record.recordType === "task" || DIRECTION_KINDS.has(kind)) ids.add("direction");
  if (kind === "person" || Boolean(record.subjectId) || ["contact", "person"].includes(record.owner)) ids.add("people");
  if (recordSpace(record) === "personal" && record.recordType !== "artifact" && record.recordType !== "relationship") ids.add("self");
  if (record.recordType === "artifact" || RESOURCE_KINDS.has(kind)) ids.add("resources");
  if (recordSpace(record) === "work") ids.add("work");
  if (ENVIRONMENT_KINDS.has(kind) || record.owner === "platform.place") ids.add("environment");
  if (record.recordType === "artifact" || record.recordType === "relationship" || KNOWLEDGE_KINDS.has(kind) || record.owner === "platform.annotate") ids.add("knowledge");
  if (record.recordType === "observation" || record.recordType === "task" || CHANGE_KINDS.has(kind) || record.revision > 1) ids.add("change");
  if (ids.size === 0) ids.add("self");
  return PRESENTATION_LENS_IDS.filter((id) => ids.has(id));
}

export function projectLensRecords(records: CanonicalRecord[], lensId: PresentationLensId): CanonicalRecord[] {
  return records
    .filter((record) => lensIdsForRecord(record).includes(lensId))
    .sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt) || left.id.localeCompare(right.id));
}
