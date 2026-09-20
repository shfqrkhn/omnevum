export const V018_LAUNCHPAD_FLOWS = [
  "Note/Knowledge",
  "Task/Project",
  "Calendar/Time",
  "Habit/Routine",
  "Document/Artifact",
  "Automation"
] as const;

export type V018LaunchpadFlow = (typeof V018_LAUNCHPAD_FLOWS)[number];

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

export interface OwnershipBoundaryResult {
  accepted: boolean;
  owner: string;
  reasons: string[];
}

export function canonicalOwnerForFlow(flow: V018LaunchpadFlow): string {
  return CANONICAL_OWNER_BY_FLOW[flow];
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
