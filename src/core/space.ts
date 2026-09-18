import type { CommandBus } from "./commands";
import type { CanonicalRecord } from "./model";
import type { CanonicalStore } from "./storage";
import type { SpaceId } from "./domain";

export interface SpaceMembershipData {
  kind: "space-membership";
  recordId: string;
  space: SpaceId;
  status: "ACTIVE" | "REMOVED";
  text: string;
}

export class SpaceService {
  public constructor(private readonly store: CanonicalStore, private readonly commands: CommandBus) {}

  public async add(recordId: string, space: SpaceId): Promise<CanonicalRecord> {
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
  return isSpaceReference(record) && typeof record.data.recordId === "string" && (record.data.space === "personal" || record.data.space === "household" || record.data.space === "work") && record.data.status === "ACTIVE";
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

function isSpaceReference(record: CanonicalRecord): record is CanonicalRecord & { data: SpaceMembershipData } {
  return record.owner === "platform.space" && record.recordType === "relationship" && record.data.kind === "space-membership";
}
