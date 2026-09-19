import type { CanonicalRecord, RecordType } from "./model";

export const BUILT_IN_SPACE_IDS = ["personal", "household", "work"] as const;
export type BuiltInSpaceId = (typeof BUILT_IN_SPACE_IDS)[number];
export type SpaceId = string;
export const SPACE_LABELS: Record<BuiltInSpaceId, string> = {
  personal: "Personal",
  household: "Household",
  work: "Work"
};
const SPACE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{1,159}$/;

export function isSpaceId(value: unknown): value is SpaceId {
  return typeof value === "string" && SPACE_ID_PATTERN.test(value);
}

export function isBuiltInSpaceId(value: unknown): value is BuiltInSpaceId {
  return value === "personal" || value === "household" || value === "work";
}
export type TriageStatus = "INBOX" | "REVIEWED" | "DEFERRED" | "CLARIFY";
export type TriageDisposition = "REFERENCE" | "LINKED" | "ROUTED" | "SPLIT" | "DELETED";
export type TriageProposalAction = "REVIEW" | "CLARIFY" | "DEFER" | "REFERENCE" | "LINK" | "ROUTE" | "SPLIT" | "DELETE";

export interface TriageProposal {
  sourceId: string;
  possibleOwners: string[];
  possibleTypes: RecordType[];
  possibleActions: TriageProposalAction[];
  basis: "AMBIGUOUS_OR_UNRESOLVED";
}

export function recordText(record: CanonicalRecord): string {
  if (record.recordType === "relationship" && typeof record.data.sourceId === "string" && typeof record.data.targetId === "string") {
    const relation = typeof record.data.relation === "string"
      ? record.data.relation
      : record.data.kind === "dependency-link" && typeof record.data.edgeKind === "string" && typeof record.data.label === "string"
        ? `${record.data.edgeKind}: ${record.data.label}`
        : "related";
    return `${record.data.sourceId} -> ${record.data.targetId}: ${relation}`;
  }
  if (record.data.kind === "evidence-link" && typeof record.data.claim === "string") return record.data.claim;
  return typeof record.data.text === "string" ? record.data.text : record.recordType;
}

export function recordSpace(record: CanonicalRecord): SpaceId {
  return isSpaceId(record.data.space) ? record.data.space : "personal";
}

export function recordTriageStatus(record: CanonicalRecord): TriageStatus {
  return record.data.triageStatus === "REVIEWED" || record.data.triageStatus === "DEFERRED" || record.data.triageStatus === "CLARIFY" ? record.data.triageStatus : "INBOX";
}

export function recordTriageDisposition(record: CanonicalRecord): TriageDisposition | undefined {
  return record.data.triageDisposition === "REFERENCE" || record.data.triageDisposition === "LINKED" || record.data.triageDisposition === "ROUTED" || record.data.triageDisposition === "SPLIT" || record.data.triageDisposition === "DELETED" ? record.data.triageDisposition : undefined;
}

export function recordTriageDeferredUntil(record: CanonicalRecord): string | undefined {
  const value = record.data.triageDeferredUntil;
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : undefined;
}

export function proposeTriage(record: CanonicalRecord): TriageProposal {
  const possibleTypes: RecordType[] = record.recordType === "note" ? ["note", "task"] : [record.recordType];
  return {
    sourceId: record.id,
    possibleOwners: [...new Set([record.owner, "core.capture"])],
    possibleTypes,
    possibleActions: ["REVIEW", "CLARIFY", "DEFER", "REFERENCE", "LINK", "ROUTE", "SPLIT", "DELETE"],
    basis: "AMBIGUOUS_OR_UNRESOLVED"
  };
}

export function isCompletedTask(record: CanonicalRecord): boolean {
  return record.recordType === "task" && record.data.status === "DONE";
}
