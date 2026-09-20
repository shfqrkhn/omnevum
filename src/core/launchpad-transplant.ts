import type { SpaceId } from "./domain";
import type { CreateRecordInput } from "./commands";
import type { CaptureKind, RecordType } from "./model";

export const V018_LAUNCHPAD_FLOWS = [
  "Note/Knowledge",
  "Task/Project",
  "Calendar/Time",
  "Habit/Routine",
  "Document/Artifact",
  "Automation"
] as const;

export type V018LaunchpadFlow = (typeof V018_LAUNCHPAD_FLOWS)[number];

export type CanonicalRecordLaunchpadFlow = Exclude<V018LaunchpadFlow, "Document/Artifact" | "Automation">;

export const CANONICAL_OWNER_BY_FLOW: Record<V018LaunchpadFlow, string> = {
  "Note/Knowledge": "core.knowledge",
  "Task/Project": "core.task",
  "Calendar/Time": "platform.time",
  "Habit/Routine": "core.progress",
  "Document/Artifact": "platform.artifact",
  Automation: "platform.automation"
};

export interface CandidateStoreDeclaration {
  storeId: string;
  flow: V018LaunchpadFlow;
  writable: boolean;
  owner: string;
}

export interface CanonicalFlowInput {
  flow: V018LaunchpadFlow;
  sourceId: string;
  recordId: string;
  revision: number;
  data: Record<string, unknown>;
}

export interface CanonicalFlowMutation {
  command: "record.create" | "record.update";
  owner: string;
  flow: V018LaunchpadFlow;
  sourceId: string;
  recordId: string;
  expectedRevision: number;
  data: Record<string, unknown>;
}

export interface LaunchpadRecordAdmission {
  flow: CanonicalRecordLaunchpadFlow;
  text: string;
  sourceId?: string;
  recordId?: string;
  space?: SpaceId;
  data?: Record<string, unknown>;
}

export interface OwnershipBoundaryResult {
  accepted: boolean;
  owner: string;
  reasons: string[];
}

export interface LaunchpadMutationAdmission {
  decision: "COMMAND_ONLY" | "REJECT_DIRECT_STORE";
  mutation: CanonicalFlowMutation;
  owner: string;
  reasons: string[];
}

export function canonicalOwnerForFlow(flow: V018LaunchpadFlow): string {
  return CANONICAL_OWNER_BY_FLOW[flow];
}

export function launchpadFlowForCaptureKind(kind: CaptureKind): CanonicalRecordLaunchpadFlow | undefined {
  if (kind === "note" || kind === "url" || kind === "voice" || kind === "person" || kind === "goal" || kind === "decision" || kind === "source") return "Note/Knowledge";
  if (kind === "task") return "Task/Project";
  if (kind === "event") return "Calendar/Time";
  if (kind === "habit") return "Habit/Routine";
  return undefined;
}

export function makeLaunchpadRecordInput(input: LaunchpadRecordAdmission): CreateRecordInput {
  const text = input.text.trim();
  if (!text) throw new Error("A launchpad record requires non-empty text");
  if (text.length > 5000) throw new Error("A launchpad record is limited to 5000 characters");
  const sourceId = input.sourceId?.trim();
  const recordType: RecordType = input.flow === "Note/Knowledge" ? "note" : input.flow === "Task/Project" ? "task" : "observation";
  return {
    ...(input.recordId?.trim() ? { id: input.recordId.trim() } : {}),
    recordType,
    owner: canonicalOwnerForFlow(input.flow),
    ...(sourceId ? { provenance: { source: "IMPORT" as const, sourceId } } : {}),
    data: {
      text,
      launchpadFlow: input.flow,
      ...(sourceId ? { stableSourceId: sourceId } : {}),
      ...(input.space ? { space: input.space } : {}),
      ...(recordType === "task" ? { status: "OPEN" } : {}),
      ...structuredClone(input.data ?? {})
    }
  };
}

export function validateCanonicalFlowInput(input: CanonicalFlowInput): CanonicalFlowMutation {
  if (!input.sourceId.trim()) throw new Error("A launchpad source identity is required");
  if (!input.recordId.trim()) throw new Error("A stable canonical record identity is required");
  if (!Number.isSafeInteger(input.revision) || input.revision < 1) throw new Error("A positive canonical revision is required");
  return {
    command: input.revision === 1 ? "record.create" : "record.update",
    owner: canonicalOwnerForFlow(input.flow),
    flow: input.flow,
    sourceId: input.sourceId.trim(),
    recordId: input.recordId.trim(),
    expectedRevision: input.revision,
    data: structuredClone(input.data)
  };
}

/**
 * Decide how a candidate-derived mutation may enter Omnevum. A candidate store
 * is never a writable authority: a rejected direct-write attempt is retained
 * as evidence while the validated mutation remains available for CommandBus.
 */
export function admitLaunchpadMutation(input: CanonicalFlowInput, candidateStores: readonly CandidateStoreDeclaration[] = []): LaunchpadMutationAdmission {
  const mutation = validateCanonicalFlowInput(input);
  const boundary = evaluateOwnershipBoundary(candidateStores, input.flow);
  return {
    decision: boundary.accepted ? "COMMAND_ONLY" : "REJECT_DIRECT_STORE",
    mutation,
    owner: boundary.owner,
    reasons: boundary.reasons
  };
}

export function evaluateOwnershipBoundary(stores: readonly CandidateStoreDeclaration[], flow: V018LaunchpadFlow): OwnershipBoundaryResult {
  const owner = canonicalOwnerForFlow(flow);
  const reasons: string[] = [];
  const writable = stores.filter((store) => store.flow === flow && store.writable);
  if (writable.length > 0) reasons.push("candidate exposes a writable store for a meaning owned by Omnevum");
  if (stores.some((store) => store.flow === flow && store.owner !== owner)) reasons.push("candidate store declares a conflicting semantic owner");
  if (stores.some((store) => store.flow === flow && !store.storeId.trim())) reasons.push("candidate store identity is missing");
  return { accepted: reasons.length === 0, owner, reasons };
}

export function assertSixFlowCoverage(flows: readonly V018LaunchpadFlow[]): void {
  const observed = new Set(flows);
  const missing = V018_LAUNCHPAD_FLOWS.filter((flow) => !observed.has(flow));
  if (missing.length > 0) throw new Error(`Launchpad proof is missing flows: ${missing.join(", ")}`);
}
