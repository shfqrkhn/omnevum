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

export interface FossRemovalInput {
  componentId: string;
  retainedInputsAvailable: boolean;
  reconstruction: CandidateGateState;
  boundedLimitationRecorded: boolean;
  coreRegressionPass: boolean;
  canonicalStatePreserved: boolean;
}

export type FossRemovalDecision = "CONTINUE_RECONSTRUCTED" | "CONTINUE_WITH_BOUNDED_LIMITATION" | "BLOCK_RELEASE";

export interface FossRemovalEvaluation {
  componentId: string;
  decision: FossRemovalDecision;
  reasons: string[];
}

export interface CopyleftObligationInput {
  componentId: string;
  license: string;
  noticePresent: boolean;
  correspondingSourceAvailable: boolean;
  isolationOrComplianceProven: boolean;
  legalReview: CandidateGateState;
}

export type CopyleftObligationDecision = "ADMIT_COMPLIANT" | "ISOLATE_CANDIDATE" | "REJECT";

export interface CopyleftObligationEvaluation {
  componentId: string;
  decision: CopyleftObligationDecision;
  reasons: string[];
}

export interface UpstreamParityInput {
  componentId: string;
  upstreamIdentity: string;
  localPatchPresent: boolean;
  parity: CandidateGateState;
  regression: CandidateGateState;
  migration: CandidateGateState;
  deltaReduced: boolean;
}

export type UpstreamParityDecision = "REMOVE_LOCAL_PATCH" | "ADAPT_LOCAL_PATH" | "RETAIN_LOCAL_PATH" | "DEFER";

export interface UpstreamParityEvaluation {
  componentId: string;
  decision: UpstreamParityDecision;
  reasons: string[];
}

export interface CompatibilityCandidateInput {
  capabilityId: string;
  acceptedUpstreamIdentity: string;
  candidateUpstreamIdentity: string;
  adapterVersion: string;
  changedBehavior: boolean;
  adapterUpdated: boolean;
  contract: CandidateGateState;
  migration: CandidateGateState;
  target: CandidateGateState;
  regression: CandidateGateState;
}

export type CompatibilityCandidateDecision = "PROMOTE_COMPATIBLE" | "ADAPT_AND_PROMOTE" | "DEFER" | "REJECT";

export interface CompatibilityCandidateEvaluation {
  capabilityId: string;
  decision: CompatibilityCandidateDecision;
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

export function evaluateFossRemoval(input: FossRemovalInput): FossRemovalEvaluation {
  const reasons: string[] = [];
  if (!input.componentId.trim()) return { componentId: input.componentId, decision: "BLOCK_RELEASE", reasons: ["component identity is required"] };
  if (input.retainedInputsAvailable && input.reconstruction === "PASS" && input.coreRegressionPass && input.canonicalStatePreserved) {
    reasons.push("retained lawful inputs reconstruct the component path and core/canonical regression passes");
    return { componentId: input.componentId, decision: "CONTINUE_RECONSTRUCTED", reasons };
  }
  if (input.boundedLimitationRecorded && input.coreRegressionPass && input.canonicalStatePreserved) {
    reasons.push("reconstruction is bounded by an explicit limitation while core operation and canonical state remain preserved");
    return { componentId: input.componentId, decision: "CONTINUE_WITH_BOUNDED_LIMITATION", reasons };
  }
  reasons.push("component removal lacks a verified reconstruction or bounded limitation with core/canonical preservation");
  return { componentId: input.componentId, decision: "BLOCK_RELEASE", reasons };
}

export function evaluateCopyleftObligations(input: CopyleftObligationInput): CopyleftObligationEvaluation {
  const reasons: string[] = [];
  if (!input.componentId.trim() || !input.license.trim()) return { componentId: input.componentId, decision: "REJECT", reasons: ["component identity and exact license are required"] };
  const obligationsComplete = input.noticePresent && input.correspondingSourceAvailable;
  if (input.isolationOrComplianceProven && input.legalReview === "PASS" && obligationsComplete) {
    reasons.push(`exact ${input.license} obligations are represented by notice, corresponding-source, and reviewed compliance evidence`);
    return { componentId: input.componentId, decision: "ADMIT_COMPLIANT", reasons };
  }
  if (input.isolationOrComplianceProven && input.legalReview !== "FAIL") {
    reasons.push("component remains isolated until notice, corresponding-source, and legal/compliance evidence is complete");
    return { componentId: input.componentId, decision: "ISOLATE_CANDIDATE", reasons };
  }
  reasons.push("copyleft obligation or isolation evidence failed; component is rejected");
  return { componentId: input.componentId, decision: "REJECT", reasons };
}

export function evaluateUpstreamParity(input: UpstreamParityInput): UpstreamParityEvaluation {
  const reasons: string[] = [];
  if (!input.componentId.trim() || !input.upstreamIdentity.trim()) return { componentId: input.componentId, decision: "DEFER", reasons: ["component and exact upstream identity are required"] };
  if (!input.localPatchPresent) return { componentId: input.componentId, decision: "RETAIN_LOCAL_PATH", reasons: ["no local patch is present to remove"] };
  if (input.parity === "UNKNOWN" || input.regression === "UNKNOWN" || input.migration === "UNKNOWN") {
    return { componentId: input.componentId, decision: "DEFER", reasons: ["parity, regression, and migration gates must be current before changing the accepted path"] };
  }
  if (input.parity === "PASS" && input.regression === "PASS" && input.migration === "PASS" && input.deltaReduced) {
    reasons.push("upstream behavior is equivalent, affected regressions pass, migration is explicit, and local delta is reduced");
    return { componentId: input.componentId, decision: "REMOVE_LOCAL_PATCH", reasons };
  }
  if (input.parity === "PASS" && input.regression === "PASS" && input.migration === "PASS") {
    reasons.push("upstream is compatible but the local delta is not yet reduced; adapt or consolidate behind the owner");
    return { componentId: input.componentId, decision: "ADAPT_LOCAL_PATH", reasons };
  }
  reasons.push("upstream parity or affected regression failed; retain the local path and record the difference");
  return { componentId: input.componentId, decision: "RETAIN_LOCAL_PATH", reasons };
}

export function evaluateCompatibilityCandidate(input: CompatibilityCandidateInput): CompatibilityCandidateEvaluation {
  const base = { capabilityId: input.capabilityId, acceptedRuntimeUnchanged: true as const, promotionRequired: true as const };
  if (!input.capabilityId.trim() || !input.acceptedUpstreamIdentity.trim() || !input.candidateUpstreamIdentity.trim() || !input.adapterVersion.trim()) return { ...base, decision: "REJECT", reasons: ["capability, upstream identities, and adapter version are required"] };
  const states = { contract: input.contract, migration: input.migration, target: input.target, regression: input.regression };
  const unknown = Object.entries(states).filter(([, state]) => state === "UNKNOWN");
  if (unknown.length > 0) return { ...base, decision: "DEFER", reasons: [`compatibility evidence is stale or missing: ${unknown.map(([name]) => name).join(", ")}`] };
  const failed = Object.entries(states).filter(([, state]) => state === "FAIL");
  if (failed.length > 0) return { ...base, decision: "REJECT", reasons: [`candidate compatibility failed: ${failed.map(([name]) => name).join(", ")}`] };
  if (input.changedBehavior && !input.adapterUpdated) return { ...base, decision: "REJECT", reasons: ["changed upstream behavior has no updated Omnevum adapter/migration"] };
  if (input.changedBehavior) return { ...base, decision: "ADAPT_AND_PROMOTE", reasons: ["changed upstream behavior is covered by the updated adapter/migration and all compatibility gates pass", "explicit promotion is required"] };
  return { ...base, decision: "PROMOTE_COMPATIBLE", reasons: ["accepted and candidate upstream behavior remains compatible across all gates", "explicit promotion is required"] };
}
