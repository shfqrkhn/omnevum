import type { CanonicalRecord, RecordType } from "./model";
import { isSpaceId, type SpaceId } from "./domain";
import type { CanonicalStore } from "./storage";

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
  searchQuery?: string;
  recordType?: RecordType;
  space?: SpaceId;
  widgets: ComposeWidget[];
  layout: "stack" | "grid";
  source: "SYSTEM" | "USER" | "PACKAGE";
}

export const VIEW_SETTING = "compose.views";
const MAX_VIEWS = 40;
const MAX_VIEW_TEXT = 240;
const MAX_VIEW_FIELDS = 50;

export function assertViewDefinition(value: unknown): asserts value is ViewDefinition {
  if (!isViewDefinition(value)) throw new Error("Invalid Compose/View definition");
}

export function isViewDefinition(value: unknown): value is ViewDefinition {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== 1 || typeof candidate.id !== "string" || !/^[a-z][a-z0-9._-]{1,120}$/.test(candidate.id) || typeof candidate.title !== "string" || !candidate.title.trim() || candidate.title.length > MAX_VIEW_TEXT || (candidate.searchQuery !== undefined && (typeof candidate.searchQuery !== "string" || candidate.searchQuery.length > 320 || !candidate.searchQuery.trim())) || (candidate.layout !== "stack" && candidate.layout !== "grid") || !["SYSTEM", "USER", "PACKAGE"].includes(String(candidate.source)) || !Array.isArray(candidate.widgets) || candidate.widgets.length === 0 || candidate.widgets.length > 32) return false;
  if (candidate.recordType !== undefined && !["note", "task", "observation", "relationship", "artifact"].includes(String(candidate.recordType))) return false;
  if (candidate.space !== undefined && !isSpaceId(candidate.space)) return false;
  return candidate.widgets.every((widget) => {
    if (typeof widget !== "object" || widget === null) return false;
    const item = widget as Record<string, unknown>;
    return typeof item.id === "string" && /^[a-z][a-z0-9._-]{1,120}$/.test(item.id) && typeof item.title === "string" && item.title.trim().length > 0 && item.title.length <= MAX_VIEW_TEXT && COMPOSE_WIDGET_TYPES.includes(item.type as ComposeWidgetType) && (item.fields === undefined || Array.isArray(item.fields) && item.fields.length <= MAX_VIEW_FIELDS && item.fields.every((field) => typeof field === "string" && isSafeField(field)));
  });
}

export function projectView(definition: ViewDefinition, records: CanonicalRecord[]): CanonicalRecord[] {
  assertViewDefinition(definition);
  return records.filter((record) => (definition.recordType === undefined || record.recordType === definition.recordType) && (definition.space === undefined || record.data.space === definition.space));
}

export class ViewRegistry {
  public constructor(private readonly store: CanonicalStore) {}

  public async list(): Promise<ViewDefinition[]> {
    const value = await this.store.getSetting<unknown>(VIEW_SETTING);
    if (!Array.isArray(value)) return [];
    return value.filter(isViewDefinition).slice(0, MAX_VIEWS).map((view) => structuredClone(view));
  }

  public async save(definition: ViewDefinition): Promise<void> {
    assertViewDefinition(definition);
    const views = (await this.list()).filter((view) => view.id !== definition.id);
    if (views.length >= MAX_VIEWS) throw new Error("View registry is full");
    views.push(structuredClone(definition));
    await this.store.setSetting(VIEW_SETTING, views);
  }

  public async remove(id: string): Promise<void> {
    if (!/^[a-z][a-z0-9._-]{1,120}$/.test(id)) throw new Error("View identity is invalid");
    const views = (await this.list()).filter((view) => view.id !== id);
    await this.store.setSetting(VIEW_SETTING, views);
  }
}

export function makeUserDashboard(title: string, fields: string[], space?: SpaceId): ViewDefinition {
  const safeFields = fields.filter(isSafeField).slice(0, MAX_VIEW_FIELDS);
  if (!title.trim() || safeFields.length === 0) throw new Error("A view title and at least one safe field are required");
  return { schemaVersion: 1, id: "user.dashboard", title: title.trim().slice(0, MAX_VIEW_TEXT), ...(space ? { space } : {}), widgets: [
    { id: "capture", type: "form", title: "Capture", fields: safeFields },
    { id: "list", type: "list", title: "Records", fields: safeFields },
    { id: "table", type: "table", title: "Table", fields: safeFields },
    { id: "chart", type: "chart", title: "Chart", fields: safeFields }
  ], layout: "grid", source: "USER" };
}

export function makeSearchView(title: string, query: string, space?: SpaceId): ViewDefinition {
  const normalizedTitle = title.trim().slice(0, MAX_VIEW_TEXT);
  const normalizedQuery = query.trim().slice(0, 320);
  if (!normalizedTitle || !normalizedQuery) throw new Error("A view title and a search query are required");
  const slug = normalizedTitle.toLocaleLowerCase("en-CA").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || "results";
  return { schemaVersion: 1, id: `search.${slug}`, title: normalizedTitle, searchQuery: normalizedQuery, ...(space ? { space } : {}), widgets: [
    { id: "search-list", type: "list", title: "Search results", fields: ["recordType", "data.text", "owner", "modifiedAt"] },
    { id: "search-table", type: "table", title: "Search table", fields: ["recordType", "data.text", "owner", "modifiedAt"] }
  ], layout: "stack", source: "USER" };
}

function isSafeField(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z][a-zA-Z0-9_.-]{0,120}$/.test(value) && !value.split(".").some((part) => part === "__proto__" || part === "prototype" || part === "constructor");
}
