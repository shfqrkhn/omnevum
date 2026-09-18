import type { CommandBus } from "./commands";
import type { CanonicalRecord } from "./model";
import type { SpaceId } from "./domain";

export interface ShareGrantInput {
  grantedTo: string;
  purpose: string;
  space: SpaceId;
  recordIds: string[];
  expiresAt?: string;
}

export interface ShareGrantData {
  kind: "share-grant";
  grantedTo: string;
  purpose: string;
  space: SpaceId;
  recordIds: string[];
  status: "ACTIVE" | "REVOKED";
  createdAt: string;
  expiresAt?: string;
  revokedAt?: string;
}

export async function createShareGrant(commands: CommandBus, input: ShareGrantInput): Promise<CanonicalRecord> {
  const grantedTo = input.grantedTo.trim().slice(0, 160);
  const purpose = input.purpose.trim().slice(0, 500);
  const recordIds = [...new Set(input.recordIds.filter((id) => /^[a-zA-Z0-9:_-]{1,160}$/.test(id)))].slice(0, 500);
  if (!grantedTo || !purpose || recordIds.length === 0) throw new Error("Share grant requires recipient, purpose, and records");
  if (input.expiresAt && !Number.isFinite(Date.parse(input.expiresAt))) throw new Error("Share grant expiry is invalid");
  const createdAt = new Date().toISOString();
  const data: ShareGrantData = { kind: "share-grant", grantedTo, purpose, space: input.space, recordIds, status: "ACTIVE", createdAt, ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}) };
  return commands.create({ recordType: "relationship", owner: "platform.share", truthClass: "USER_OBSERVATION", data: { text: `Share grant for ${grantedTo}: ${purpose}`, ...data } });
}

export async function revokeShareGrant(commands: CommandBus, grantId: string): Promise<CanonicalRecord> {
  const current = await commands.get(grantId);
  if (!current || current.owner !== "platform.share" || current.data.kind !== "share-grant") throw new Error("Share grant was not found");
  return commands.update(grantId, { ...current.data, status: "REVOKED", revokedAt: new Date().toISOString(), text: current.data.text });
}

export function canUseShareGrant(grant: CanonicalRecord, requestedRecordIds: string[], now = new Date()): boolean {
  if (grant.owner !== "platform.share" || grant.data.kind !== "share-grant" || grant.data.status !== "ACTIVE") return false;
  if (typeof grant.data.expiresAt === "string" && Date.parse(grant.data.expiresAt) <= now.getTime()) return false;
  const allowed = new Set(Array.isArray(grant.data.recordIds) ? grant.data.recordIds.filter((id): id is string => typeof id === "string") : []);
  return requestedRecordIds.length > 0 && requestedRecordIds.every((id) => allowed.has(id));
}
