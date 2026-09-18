import type { CommandBus } from "./commands";
import type { CanonicalRecord } from "./model";
import type { CanonicalStore } from "./storage";
import { BUILT_IN_SPACE_IDS, isBuiltInSpaceId, isSpaceId, SPACE_LABELS, type SpaceId } from "./domain";
import { createOpaqueId } from "./id";

const MAX_SPACE_NAME = 80;

export interface SpaceDefinition {
  id: SpaceId;
  name: string;
  builtIn: boolean;
  recordId?: string;
}

export interface SpaceDefinitionData {
  kind: "space-definition";
  space: SpaceId;
  name: string;
  status: "ACTIVE" | "REMOVED";
  text: string;
}

export interface SpaceMembershipData {
  kind: "space-membership";
  recordId: string;
  space: SpaceId;
  status: "ACTIVE" | "REMOVED";
  text: string;
}

export class SpaceService {
  public constructor(private readonly store: CanonicalStore, private readonly commands: CommandBus) {}

  public async listSpaces(): Promise<SpaceDefinition[]> {
    const builtIns = BUILT_IN_SPACE_IDS.map((id) => ({ id, name: SPACE_LABELS[id], builtIn: true } satisfies SpaceDefinition));
    const custom = (await this.store.list(true))
      .filter(isSpaceDefinition)
      .filter((record) => !record.deleted)
      .map((record) => ({ id: record.data.space, name: record.data.name, builtIn: false, recordId: record.id } satisfies SpaceDefinition));
    return [...builtIns, ...custom];
  }

  public async create(name: string): Promise<SpaceDefinition> {
    const normalized = name.trim().normalize("NFKC");
    if (!normalized) throw new Error("Space name is required");
    if (normalized.length > MAX_SPACE_NAME) throw new Error("Space name is too long");
    const existing = await this.listSpaces();
    if (existing.some((space) => space.name.normalize("NFKC").toLowerCase() === normalized.toLowerCase())) throw new Error("A Space with that name already exists");
    const id = createOpaqueId("space");
    const record = await this.commands.create({
      recordType: "relationship",
      owner: "platform.space",
      truthClass: "USER_OBSERVATION",
      data: { kind: "space-definition", space: id, name: normalized, status: "ACTIVE", text: normalized } satisfies SpaceDefinitionData
    });
    return { id, name: normalized, builtIn: false, recordId: record.id };
  }

  public async removeSpace(space: SpaceId): Promise<void> {
    if (isBuiltInSpaceId(space)) throw new Error("Built-in Spaces cannot be removed");
    const definition = (await this.store.list(true)).find((record) => isSpaceDefinition(record) && !record.deleted && record.data.space === space);
    if (!definition) throw new Error("Space was not found");
    for (const membership of await this.memberships(space)) await this.commands.update(membership.id, { ...membership.data, status: "REMOVED" });
    await this.commands.archive(definition.id);
  }

  public async add(recordId: string, space: SpaceId): Promise<CanonicalRecord> {
    if (!isSpaceId(space)) throw new Error("Space identity is invalid");
    if (!(await this.listSpaces()).some((candidate) => candidate.id === space)) throw new Error("Space was not found");
    const source = await this.store.get(recordId, true);
    if (!source) throw new Error("Space membership target was not found");
    const existing = (await this.store.list()).find((record) => isSpaceMembership(record) && record.data.recordId === recordId && record.data.space === space);
    if (existing) return existing;
    return this.commands.create({ recordType: "relationship", owner: "platform.space", truthClass: "USER_OBSERVATION", data: { kind: "space-membership", recordId, space, status: "ACTIVE", text: `${recordId} in ${space}` } satisfies SpaceMembershipData });
  }

  public async remove(membershipId: string): Promise<void> {
    const membership = await this.store.get(membershipId, true);
    if (!membership || !isSpaceMembership(membership)) return;
    await this.commands.update(membershipId, { ...membership.data, status: "REMOVED" });
  }

  public async memberships(space?: SpaceId): Promise<CanonicalRecord[]> {
    return (await this.store.list()).filter((record) => isSpaceMembership(record) && (space === undefined || record.data.space === space));
  }

  public async project(records: CanonicalRecord[], space: SpaceId): Promise<CanonicalRecord[]> {
    return projectRecordsInSpace(records, await this.memberships(), space);
  }
}

export function isSpaceMembership(record: CanonicalRecord): record is CanonicalRecord & { data: SpaceMembershipData } {
  return isSpaceReference(record) && record.data.kind === "space-membership" && typeof record.data.recordId === "string" && isSpaceId(record.data.space) && record.data.status === "ACTIVE";
}

export function isSpaceDefinition(record: CanonicalRecord): record is CanonicalRecord & { data: SpaceDefinitionData } {
  return isSpaceReference(record) && record.data.kind === "space-definition" && isSpaceId(record.data.space) && typeof record.data.name === "string" && record.data.name.trim().length > 0 && record.data.name.length <= MAX_SPACE_NAME && (record.data.status === "ACTIVE" || record.data.status === "REMOVED");
}

export function projectRecordsInSpace(records: CanonicalRecord[], memberships: CanonicalRecord[], space: SpaceId): CanonicalRecord[] {
  const activeMemberships = memberships.filter(isSpaceMembership);
  const membershipsByRecord = new Map<string, Set<SpaceId>>();
  for (const membership of activeMemberships) {
    const spaces = membershipsByRecord.get(membership.data.recordId) ?? new Set<SpaceId>();
    spaces.add(membership.data.space);
    membershipsByRecord.set(membership.data.recordId, spaces);
  }
  return records.filter((record) => {
    if (isSpaceReference(record)) return false;
    const explicitSpaces = membershipsByRecord.get(record.id);
    return explicitSpaces ? explicitSpaces.has(space) : (record.data.space === space || (space === "personal" && record.data.space === undefined));
  });
}

function isSpaceReference(record: CanonicalRecord): record is CanonicalRecord & { data: SpaceMembershipData | SpaceDefinitionData } {
  return record.owner === "platform.space" && record.recordType === "relationship" && (record.data.kind === "space-membership" || record.data.kind === "space-definition");
}
