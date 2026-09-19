export const RETIREMENT_COPY_KINDS = ["LOCAL_ORIGIN", "SYNC_REPLICA", "OFF_ORIGIN_BACKUP", "REMOTE_ARTIFACT_TIER"] as const;
export type RetirementCopyKind = (typeof RETIREMENT_COPY_KINDS)[number];

export type RetirementCopyDisposition = "DELETABLE" | "REQUEST_ONLY" | "UNREACHABLE" | "NOT_CONFIGURED";
export type RetirementCopyState = "PRESENT" | "VERIFIED_DELETED" | "UNKNOWN" | "NOT_CONFIGURED";

export interface RetirementCopyObservation {
  id: string;
  kind: RetirementCopyKind;
  label: string;
  configured: boolean;
  disposition: RetirementCopyDisposition;
  state: RetirementCopyState;
  observedAt?: string;
}

export interface RetirementCopyInventory {
  copies: RetirementCopyObservation[];
  unresolvedCopyIds: string[];
  status: "BLOCKED" | "READY";
}

export function enumerateRetirementCopies(copies: readonly RetirementCopyObservation[]): RetirementCopyInventory {
  const seenIds = new Set<string>();
  const normalized = copies.map((copy) => {
    assertRetirementCopyObservation(copy);
    if (seenIds.has(copy.id)) throw new Error("Retirement copy identifiers must be unique");
    seenIds.add(copy.id);
    return structuredClone(copy);
  }).sort((left, right) => RETIREMENT_COPY_KINDS.indexOf(left.kind) - RETIREMENT_COPY_KINDS.indexOf(right.kind) || left.id.localeCompare(right.id));
  const unresolvedCopyIds = normalized.filter((copy) => copy.configured && copy.state !== "VERIFIED_DELETED").map((copy) => copy.id);
  return {
    copies: normalized,
    unresolvedCopyIds,
    status: unresolvedCopyIds.length === 0 ? "READY" : "BLOCKED"
  };
}

export function parseRetirementCopyObservations(value: unknown): RetirementCopyObservation[] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as { copies?: unknown };
  if (!Array.isArray(candidate.copies) || candidate.copies.length > 40) return undefined;
  try {
    const copies = candidate.copies as RetirementCopyObservation[];
    enumerateRetirementCopies(copies);
    return structuredClone(copies);
  } catch {
    return undefined;
  }
}

function assertRetirementCopyObservation(value: RetirementCopyObservation): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Retirement copy observation is invalid");
  if (typeof value.id !== "string" || value.id.length === 0 || value.id.length > 160) throw new Error("Retirement copy identifier is invalid");
  if (!RETIREMENT_COPY_KINDS.includes(value.kind)) throw new Error("Retirement copy kind is invalid");
  if (typeof value.label !== "string" || value.label.length === 0 || value.label.length > 240) throw new Error("Retirement copy label is invalid");
  if (typeof value.configured !== "boolean") throw new Error("Retirement copy configuration state is invalid");
  if (!(["DELETABLE", "REQUEST_ONLY", "UNREACHABLE", "NOT_CONFIGURED"] as const).includes(value.disposition)) throw new Error("Retirement copy disposition is invalid");
  if ((["PRESENT", "VERIFIED_DELETED", "UNKNOWN", "NOT_CONFIGURED"] as const).includes(value.state) === false) throw new Error("Retirement copy state is invalid");
  if (!value.configured && (value.disposition !== "NOT_CONFIGURED" || value.state !== "NOT_CONFIGURED")) throw new Error("Unconfigured retirement copies must be marked NOT_CONFIGURED");
  if (value.configured && (value.disposition === "NOT_CONFIGURED" || value.state === "NOT_CONFIGURED")) throw new Error("Configured retirement copies cannot be marked NOT_CONFIGURED");
  if (value.disposition === "UNREACHABLE" && value.state !== "UNKNOWN") throw new Error("Unreachable retirement copies must remain UNKNOWN");
  if (value.state === "UNKNOWN" && value.disposition !== "UNREACHABLE") throw new Error("UNKNOWN retirement copies must remain UNREACHABLE");
  if (value.observedAt !== undefined && (typeof value.observedAt !== "string" || value.observedAt.length > 80)) throw new Error("Retirement copy observation time is invalid");
}
