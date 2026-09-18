import type { CommandBus } from "./commands";
import type { CanonicalRecord } from "./model";

export type EvidenceRelation = "SUPPORTS" | "CONTRADICTS" | "QUALIFIES" | "DERIVES_FROM";

export interface EvidenceLinkInput {
  subjectId: string;
  sourceId: string;
  relation: EvidenceRelation;
  claim: string;
  uncertainty?: string;
}

export async function createEvidenceLink(commands: CommandBus, input: EvidenceLinkInput): Promise<CanonicalRecord> {
  if (input.subjectId === input.sourceId) throw new Error("Evidence subject and source must be distinct");
  if (!input.claim.trim()) throw new Error("Evidence claim is required");
  return commands.create({
    recordType: "relationship",
    owner: "platform.evidence",
    truthClass: "SOURCE_CLAIM",
    data: { kind: "evidence-link", subjectId: input.subjectId, sourceId: input.sourceId, relation: input.relation, claim: input.claim.trim().slice(0, 1000), ...(input.uncertainty?.trim() ? { uncertainty: input.uncertainty.trim().slice(0, 500) } : {}), triageStatus: "REVIEWED" }
  });
}
