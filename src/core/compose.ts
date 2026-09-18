import type { CanonicalRecord, RecordType } from "./model";
import type { SpaceId } from "./domain";

export const COMPOSE_WIDGET_TYPES = ["form", "list", "table", "chart", "timeline", "text"] as const;
export type ComposeWidgetType = (typeof COMPOSE_WIDGET_TYPES)[number];

export interface ComposeWidget {
  id: string;
  type: ComposeWidgetType;
  title: string;
  fields?: string[];
}

export interface ViewDefinition {
  schemaVersion: 1;
  id: string;
  title: string;
  recordType?: RecordType;
  space?: SpaceId;
  widgets: ComposeWidget[];
  layout: "stack" | "grid";
  source: "SYSTEM" | "USER" | "PACKAGE";
}

export function assertViewDefinition(value: unknown): asserts value is ViewDefinition {
  if (!isViewDefinition(value)) throw new Error("Invalid Compose/View definition");
}

export function isViewDefinition(value: unknown): value is ViewDefinition {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== 1 || typeof candidate.id !== "string" || !candidate.id || typeof candidate.title !== "string" || !candidate.title || (candidate.layout !== "stack" && candidate.layout !== "grid") || !["SYSTEM", "USER", "PACKAGE"].includes(String(candidate.source)) || !Array.isArray(candidate.widgets) || candidate.widgets.length > 32) return false;
  if (candidate.recordType !== undefined && !["note", "task", "observation", "relationship", "artifact"].includes(String(candidate.recordType))) return false;
  if (candidate.space !== undefined && !["personal", "household", "work"].includes(String(candidate.space))) return false;
  return candidate.widgets.every((widget) => {
    if (typeof widget !== "object" || widget === null) return false;
    const item = widget as Record<string, unknown>;
    return typeof item.id === "string" && item.id.length > 0 && typeof item.title === "string" && item.title.length > 0 && COMPOSE_WIDGET_TYPES.includes(item.type as ComposeWidgetType) && (item.fields === undefined || Array.isArray(item.fields) && item.fields.every((field) => typeof field === "string" && field.length <= 120));
  });
}

export function projectView(definition: ViewDefinition, records: CanonicalRecord[]): CanonicalRecord[] {
  assertViewDefinition(definition);
  return records.filter((record) => (definition.recordType === undefined || record.recordType === definition.recordType) && (definition.space === undefined || record.data.space === definition.space));
}
