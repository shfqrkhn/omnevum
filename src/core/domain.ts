import type { CanonicalRecord } from "./model";

export type SpaceId = "personal" | "household" | "work";
export const SPACE_LABELS: Record<SpaceId, string> = {
  personal: "Personal",
  household: "Household",
  work: "Work"
};
export type TriageStatus = "INBOX" | "REVIEWED";

export function recordText(record: CanonicalRecord): string {
  if (record.recordType === "relationship" && typeof record.data.sourceId === "string" && typeof record.data.targetId === "string") {
    return `${record.data.sourceId} -> ${record.data.targetId}: ${typeof record.data.relation === "string" ? record.data.relation : "related"}`;
  }
  if (record.data.kind === "evidence-link" && typeof record.data.claim === "string") return record.data.claim;
  return typeof record.data.text === "string" ? record.data.text : record.recordType;
}

export function recordSpace(record: CanonicalRecord): SpaceId {
  return record.data.space === "household" || record.data.space === "work" ? record.data.space : "personal";
}

export function recordTriageStatus(record: CanonicalRecord): TriageStatus {
  return record.data.triageStatus === "REVIEWED" ? "REVIEWED" : "INBOX";
}

export function isCompletedTask(record: CanonicalRecord): boolean {
  return record.recordType === "task" && record.data.status === "DONE";
}
