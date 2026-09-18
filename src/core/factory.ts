import type { CanonicalRecord } from "./model";
import type { CommandBus } from "./commands";
import { assertGameManifest, GameSession, type GameManifest, type GameRuntimeAdapter } from "./game";
import { generateBaselineView, isPackageManifest, type PackageManifest } from "./package-contract";
import type { ViewDefinition } from "./compose";

export type FactoryFieldType = "text" | "number" | "tags" | "boolean";

export interface FactoryField {
  id: string;
  type: FactoryFieldType;
  required?: boolean;
  labels: Record<string, string>;
}

export interface RecordAppDefinitionInput {
  manifest: PackageManifest;
  title: Record<string, string>;
  fields: FactoryField[];
}

export interface RecordAppDefinition {
  manifest: PackageManifest;
  fields: FactoryField[];
  baselineView: ViewDefinition;
  label(locale: string): string;
  createRuntime(commands: CommandBus): RecordAppRuntime;
}

const LOCALE_PATTERN = /^[a-z]{2}(?:-[A-Z]{2})?$/u;
const FIELD_PATTERN = /^[a-z][a-z0-9._-]{1,79}$/u;
const MAX_FIELDS = 50;
const MAX_TEXT = 2_000;

export function createRecordAppDefinition(input: RecordAppDefinitionInput): RecordAppDefinition {
  if (!isPackageManifest(input.manifest)) throw new Error("Invalid record app package manifest");
  if (!isLocalizedMap(input.title)) throw new Error("Record app title must provide a localized label");
  if (!Array.isArray(input.fields) || input.fields.length === 0 || input.fields.length > MAX_FIELDS) throw new Error("Record app fields are outside the supported bound");
  const fields = input.fields.map((field) => validateField(field));
  if (new Set(fields.map((field) => field.id)).size !== fields.length) throw new Error("Record app field IDs must be unique");
  const manifest = structuredClone(input.manifest);
  const title = structuredClone(input.title);
  const fieldIds = fields.map((field) => field.id);
  return {
    manifest,
    fields,
    baselineView: generateBaselineView(manifest, fieldIds),
    label: (locale) => title[locale] ?? title[Object.keys(title)[0]!]!,
    createRuntime: (commands) => new RecordAppRuntime(manifest, fields, commands)
  };
}

export class RecordAppRuntime {
  public constructor(private readonly manifest: PackageManifest, private readonly fields: FactoryField[], private readonly commands: CommandBus) {}

  public async capture(input: Record<string, unknown>): Promise<CanonicalRecord> {
    const data = normalizeFields(this.fields, input);
    return this.commands.create({ recordType: "note", owner: this.manifest.packageId, truthClass: "USER_OBSERVATION", data: { ...data, factoryPackage: this.manifest.packageId, factorySchema: this.manifest.dataSchema, triageStatus: "REVIEWED" } });
  }

  public async list(): Promise<CanonicalRecord[]> {
    return (await this.commands.list()).filter((record) => record.recordType === "note" && record.owner === this.manifest.packageId && record.data.factoryPackage === this.manifest.packageId);
  }

  public async complete(id: string, expectedRevision?: number): Promise<CanonicalRecord> {
    const current = await this.requireOwned(id);
    return this.commands.update(id, { ...current.data, status: "DONE" }, expectedRevision ?? current.revision);
  }

  public async update(id: string, input: Record<string, unknown>, expectedRevision?: number): Promise<CanonicalRecord> {
    const current = await this.requireOwned(id);
    const data = normalizeFields(this.fields, input);
    return this.commands.update(id, { ...data, factoryPackage: this.manifest.packageId, factorySchema: this.manifest.dataSchema, triageStatus: current.data.triageStatus ?? "REVIEWED", ...(current.data.status === "DONE" ? { status: "DONE" } : {}) }, expectedRevision ?? current.revision);
  }

  public async archive(id: string): Promise<void> {
    await this.requireOwned(id);
    await this.commands.archive(id);
  }

  private async requireOwned(id: string): Promise<CanonicalRecord> {
    const record = await this.commands.get(id, true);
    if (!record || record.owner !== this.manifest.packageId || record.data.factoryPackage !== this.manifest.packageId) throw new Error("Record does not belong to this app package");
    return record;
  }
}

export interface GameDefinition {
  manifest: GameManifest;
  createSession(adapter: GameRuntimeAdapter, seed?: number): GameSession;
  boardLayout(viewportWidth: number): { columns: number; compact: boolean };
}

export function createGameDefinition(manifest: GameManifest): GameDefinition {
  assertGameManifest(manifest);
  const frozenManifest = structuredClone(manifest);
  return {
    manifest: frozenManifest,
    createSession: (adapter, seed = 1) => new GameSession(frozenManifest, adapter, seed),
    boardLayout: (viewportWidth) => {
      if (!Number.isFinite(viewportWidth) || viewportWidth < 240) throw new Error("Game viewport is outside the supported bound");
      return { columns: viewportWidth < 480 ? 1 : viewportWidth < 900 ? 2 : 4, compact: viewportWidth < 640 };
    }
  };
}

function validateField(field: FactoryField): FactoryField {
  if (typeof field !== "object" || field === null || !FIELD_PATTERN.test(field.id) || !["text", "number", "tags", "boolean"].includes(field.type) || !isLocalizedMap(field.labels)) throw new Error("Invalid record app field");
  return { id: field.id, type: field.type, ...(field.required ? { required: true } : {}), labels: structuredClone(field.labels) };
}

function isLocalizedMap(value: unknown): value is Record<string, string> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length > 0 && Object.entries(value).every(([locale, label]) => LOCALE_PATTERN.test(locale) && typeof label === "string" && label.trim().length > 0 && label.length <= 240);
}

function normalizeFields(fields: FactoryField[], input: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Set(fields.map((field) => field.id));
  if (Object.keys(input).some((key) => !allowed.has(key))) throw new Error("Record app input contains an undeclared field");
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const value = input[field.id];
    if (value === undefined || value === null || value === "") {
      if (field.required) throw new Error(`Record app field ${field.id} is required`);
      continue;
    }
    if (field.type === "text") {
      if (typeof value !== "string" || value.trim().length > MAX_TEXT) throw new Error(`Record app field ${field.id} is invalid`);
      result[field.id] = value.trim();
    } else if (field.type === "number") {
      if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Record app field ${field.id} is invalid`);
      result[field.id] = value;
    } else if (field.type === "boolean") {
      if (typeof value !== "boolean") throw new Error(`Record app field ${field.id} is invalid`);
      result[field.id] = value;
    } else {
      if (!Array.isArray(value) || value.length > 20 || value.some((item) => typeof item !== "string" || item.trim().length === 0 || item.length > 80)) throw new Error(`Record app field ${field.id} is invalid`);
      result[field.id] = value.map((item) => item.trim());
    }
  }
  return result;
}
