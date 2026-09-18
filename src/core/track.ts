import type { CommandBus } from "./commands";
import type { CanonicalRecord } from "./model";
import type { CanonicalStore } from "./storage";
import { isSpaceId, type SpaceId } from "./domain";

export interface TrackDefinition {
  id: string;
  name: string;
  unit?: string;
  valueType: "NUMBER" | "TEXT" | "BOOLEAN" | "RATING";
  space: SpaceId;
  subjectId?: string;
}

export interface TrackObservation {
  definitionId: string;
  value: number | string | boolean;
  observedAt: string;
  note?: string;
}

export class TrackService {
  public constructor(private readonly store: CanonicalStore, private readonly commands: CommandBus) {}

  public async define(input: Omit<TrackDefinition, "id">): Promise<CanonicalRecord> {
    assertDefinition(input);
    const existing = await this.findDefinition(input.name, input.space, input.subjectId);
    if (existing) return existing;
    return this.commands.create({
      recordType: "observation",
      owner: "platform.track",
      truthClass: "USER_OBSERVATION",
      data: { kind: "tracker-definition", name: input.name.trim(), ...(input.unit ? { unit: input.unit.trim() } : {}), valueType: input.valueType, space: input.space, ...(input.subjectId ? { subjectId: input.subjectId } : {}), triageStatus: "REVIEWED" }
    });
  }

  public async observe(definition: CanonicalRecord | TrackDefinition, value: TrackObservation["value"], note = "", observedAt = new Date().toISOString()): Promise<CanonicalRecord> {
    const definitionId = definition.id;
    const data: Record<string, unknown> = "data" in definition ? definition.data : { ...definition };
    const valueType = data.valueType;
    if (valueType === "NUMBER" && (typeof value !== "number" || !Number.isFinite(value))) throw new Error("Numeric tracker observations require a finite number");
    if (valueType === "BOOLEAN" && typeof value !== "boolean") throw new Error("Boolean tracker observations require a boolean");
    if ((valueType === "TEXT" || valueType === "RATING") && typeof value !== "string" && typeof value !== "number") throw new Error("Tracker value type does not match the definition");
    const name = typeof data.name === "string" ? data.name : "Observation";
    const unit = typeof data.unit === "string" ? data.unit : undefined;
    const space = isSpaceId(data.space) ? data.space : "personal";
    return this.commands.create({
      recordType: "observation",
      owner: "platform.track",
      data: { kind: "tracker-observation", definitionId, metricName: name, value, ...(unit ? { unit } : {}), space, observedAt, ...(note.trim() ? { note: note.trim(), text: note.trim() } : { text: `${name}: ${String(value)}${unit ? ` ${unit}` : ""}` }), triageStatus: "REVIEWED" }
    });
  }

  public async findDefinition(name: string, space: SpaceId, subjectId?: string): Promise<CanonicalRecord | undefined> {
    const normalized = name.trim().normalize("NFKC").toLowerCase();
    return (await this.store.list()).find((record) => record.owner === "platform.track" && record.data.kind === "tracker-definition" && typeof record.data.name === "string" && record.data.name.normalize("NFKC").toLowerCase() === normalized && record.data.space === space && record.data.subjectId === subjectId);
  }
}

function assertDefinition(input: Omit<TrackDefinition, "id">): void {
  if (!input.name.trim() || input.name.trim().length > 120) throw new Error("Tracker name must contain 1-120 characters");
  if (!["NUMBER", "TEXT", "BOOLEAN", "RATING"].includes(input.valueType)) throw new Error("Unsupported tracker value type");
  if (input.unit && input.unit.trim().length > 40) throw new Error("Tracker unit must contain at most 40 characters");
}
