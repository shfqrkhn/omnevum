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

export const FOSS_ENTRANT_GATES = ["source", "license", "security", "fit", "maintenance", "target"] as const;
export type FossEntrantGate = typeof FOSS_ENTRANT_GATES[number];

export interface FossEntrantInput {
  entrantId: string;
  name: string;
  capabilityGap: string;
  sourceIdentity: string;
  license: string;
  isolatedCandidateRef: string;
  gates: Record<FossEntrantGate, CandidateGateState>;
}

export interface FossEntrantEvaluation {
  entrantId: string;
  decision: UpstreamCandidateDecision;
  acceptedRuntimeUnchanged: true;
  promotionRequired: true;
  reasons: string[];
}

export type VulnerabilityFastLaneDecision = "FIX_CANDIDATE" | "DISABLE_OPTIONAL" | "BLOCK_RELEASE";

export interface VulnerabilityFastLaneInput {
  advisoryId: string;
  packageName: string;
  severity: "HIGH" | "CRITICAL";
  affectedScope: "CORE" | "OPTIONAL";
  fixVersion?: string;
  fixGates?: { source: CandidateGateState; security: CandidateGateState; contract: CandidateGateState; target: CandidateGateState };
  disablePathVerified: boolean;
  coreRegressionPass: boolean;
  coreDataPreserved: boolean;
}

export interface VulnerabilityFastLaneEvaluation {
  advisoryId: string;
  packageName: string;
  decision: VulnerabilityFastLaneDecision;
  falsePassPrevented: true;
  coreOperationPreserved: boolean;
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

export function evaluateFossEntrant(input: FossEntrantInput): FossEntrantEvaluation {
  const reasons: string[] = [];
  if (!/^[-a-z0-9@/_.]{1,214}$/i.test(input.entrantId.trim())) return { entrantId: input.entrantId, decision: "REJECT", acceptedRuntimeUnchanged: true, promotionRequired: true, reasons: ["entrant identity is invalid"] };
  if (!input.name.trim() || !input.capabilityGap.trim()) return { entrantId: input.entrantId, decision: "REJECT", acceptedRuntimeUnchanged: true, promotionRequired: true, reasons: ["entrant name and material capability gap are required"] };
  if (!input.sourceIdentity.trim() || !input.license.trim() || !input.isolatedCandidateRef.trim()) return { entrantId: input.entrantId, decision: "REJECT", acceptedRuntimeUnchanged: true, promotionRequired: true, reasons: ["exact source, license, and isolated candidate identity are required"] };
  const missing = FOSS_ENTRANT_GATES.filter((gate) => input.gates[gate] !== "PASS");
  if (input.gates.license === "FAIL" || input.gates.security === "FAIL") {
    reasons.push("license or security gate failed; entrant is rejected without runtime substitution");
    return { entrantId: input.entrantId, decision: "REJECT", acceptedRuntimeUnchanged: true, promotionRequired: true, reasons };
  }
  if (missing.length > 0) {
    reasons.push(`entrant remains isolated until gates pass: ${missing.map((gate) => `${gate}=${input.gates[gate]}`).join(", ")}`);
    return { entrantId: input.entrantId, decision: "DEFER", acceptedRuntimeUnchanged: true, promotionRequired: true, reasons };
  }
  reasons.push("entrant fills a recorded capability gap and passes source, license, security, fit, maintenance, and target gates");
  reasons.push("explicit promotion and replacement regression evidence are still required");
  return { entrantId: input.entrantId, decision: "ADOPT_CANDIDATE", acceptedRuntimeUnchanged: true, promotionRequired: true, reasons };
}

export function evaluateVulnerabilityFastLane(input: VulnerabilityFastLaneInput): VulnerabilityFastLaneEvaluation {
  const reasons = [`${input.severity} advisory ${input.advisoryId} affects ${input.packageName}`];
  const fixGates = input.fixGates ? Object.entries(input.fixGates) : [];
  const fixReady = Boolean(input.fixVersion) && fixGates.length === 4 && fixGates.every(([, state]) => state === "PASS");
  if (fixReady) {
    reasons.push(`isolated fix candidate ${input.fixVersion} passes source, security, contract, and target gates`);
    reasons.push("promotion remains explicit; the accepted runtime is not changed by evaluation");
    return { advisoryId: input.advisoryId, packageName: input.packageName, decision: "FIX_CANDIDATE", falsePassPrevented: true, coreOperationPreserved: true, reasons };
  }
  if (input.affectedScope === "OPTIONAL" && input.disablePathVerified && input.coreRegressionPass && input.coreDataPreserved) {
    reasons.push("affected optional capability can be disabled/degraded while core regression and data-preservation checks pass");
    return { advisoryId: input.advisoryId, packageName: input.packageName, decision: "DISABLE_OPTIONAL", falsePassPrevented: true, coreOperationPreserved: true, reasons };
  }
  reasons.push("no fully qualified fix or safe optional disable path exists; release must remain blocked rather than report false PASS");
  return { advisoryId: input.advisoryId, packageName: input.packageName, decision: "BLOCK_RELEASE", falsePassPrevented: true, coreOperationPreserved: input.coreRegressionPass && input.coreDataPreserved, reasons };
}
