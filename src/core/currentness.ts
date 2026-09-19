export type CandidateGateState = "PASS" | "UNKNOWN" | "FAIL";

export const UPSTREAM_CANDIDATE_GATES = ["currentness", "license", "security", "contract", "migration", "target"] as const;
export type UpstreamCandidateGate = typeof UPSTREAM_CANDIDATE_GATES[number];

export type UpstreamCandidateDecision = "ADOPT_CANDIDATE" | "DEFER" | "REJECT";

export interface UpstreamCandidateInput {
  candidateId: string;
  packageName: string;
  acceptedVersion: string;
  candidateVersion: string;
  sourceIdentity: string;
  releaseNotes: string;
  isolatedCandidateRef: string;
  gates: Record<UpstreamCandidateGate, CandidateGateState>;
}

export interface UpstreamCandidateEvaluation {
  candidateId: string;
  packageName: string;
  acceptedVersion: string;
  candidateVersion: string;
  majorUpdate: boolean;
  decision: UpstreamCandidateDecision;
  acceptedRuntimeUnchanged: true;
  promotionRequired: true;
  reasons: string[];
}

type ParsedVersion = { major: number; minor: number; patch: number };

function parseVersion(value: string): ParsedVersion | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/.exec(value.trim());
  if (!match) return undefined;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function compareVersions(left: ParsedVersion, right: ParsedVersion): number {
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}

function invalidCandidate(input: UpstreamCandidateInput, reason: string): UpstreamCandidateEvaluation {
  return {
    candidateId: input.candidateId,
    packageName: input.packageName,
    acceptedVersion: input.acceptedVersion,
    candidateVersion: input.candidateVersion,
    majorUpdate: false,
    decision: "REJECT",
    acceptedRuntimeUnchanged: true,
    promotionRequired: true,
    reasons: [reason]
  };
}

export function evaluateUpstreamCandidate(input: UpstreamCandidateInput): UpstreamCandidateEvaluation {
  if (!/^[-a-z0-9@/_.]{1,214}$/i.test(input.packageName.trim())) return invalidCandidate(input, "package identity is invalid");
  if (!/^[-a-z0-9_.:/]{4,256}$/i.test(input.candidateId.trim())) return invalidCandidate(input, "candidate identity is invalid");
  if (!input.sourceIdentity.trim()) return invalidCandidate(input, "exact source identity is required");
  if (!input.releaseNotes.trim()) return invalidCandidate(input, "release notes/currentness record is required");
  if (!input.isolatedCandidateRef.trim()) return invalidCandidate(input, "isolated candidate reference is required");
  const accepted = parseVersion(input.acceptedVersion);
  const candidate = parseVersion(input.candidateVersion);
  if (!accepted || !candidate) return invalidCandidate(input, "exact semantic versions are required");
  if (compareVersions(candidate, accepted) <= 0) return invalidCandidate(input, "candidate version must be newer than the accepted version");

  const majorUpdate = candidate.major !== accepted.major;
  const reasons = majorUpdate ? ["major update is isolated from the accepted runtime"] : ["candidate is newer but not a major update"];
  const missing = UPSTREAM_CANDIDATE_GATES.filter((gate) => input.gates[gate] !== "PASS");
  const policyFailure = missing.filter((gate) => (gate === "license" || gate === "security") && input.gates[gate] === "FAIL");
  if (policyFailure.length > 0) {
    reasons.push(`policy-critical gate failure: ${policyFailure.join(", ")}`);
    return { candidateId: input.candidateId, packageName: input.packageName, acceptedVersion: input.acceptedVersion, candidateVersion: input.candidateVersion, majorUpdate, decision: "REJECT", acceptedRuntimeUnchanged: true, promotionRequired: true, reasons };
  }
  if (missing.length > 0) {
    reasons.push(`candidate remains isolated until gates pass: ${missing.map((gate) => `${gate}=${input.gates[gate]}`).join(", ")}`);
    return { candidateId: input.candidateId, packageName: input.packageName, acceptedVersion: input.acceptedVersion, candidateVersion: input.candidateVersion, majorUpdate, decision: "DEFER", acceptedRuntimeUnchanged: true, promotionRequired: true, reasons };
  }
  reasons.push("all isolated contract, migration, target, currentness, license, and security gates pass");
  reasons.push("explicit promotion is still required before changing the accepted runtime");
  return { candidateId: input.candidateId, packageName: input.packageName, acceptedVersion: input.acceptedVersion, candidateVersion: input.candidateVersion, majorUpdate, decision: "ADOPT_CANDIDATE", acceptedRuntimeUnchanged: true, promotionRequired: true, reasons };
}
