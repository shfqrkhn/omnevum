import { describe, expect, it } from "vitest";
import { evaluateCompatibilityCandidate, evaluateCopyleftObligations, evaluateFossEntrant, evaluateFossRemoval, evaluateUpstreamCandidate, evaluateUpstreamParity, evaluateVulnerabilityFastLane, type CompatibilityCandidateInput, type CopyleftObligationInput, type FossEntrantInput, type FossRemovalInput, type UpstreamCandidateInput, type UpstreamParityInput, type VulnerabilityFastLaneInput } from "./currentness";

const baseCandidate = (): UpstreamCandidateInput => ({
  candidateId: "vite-9.0.0-candidate-2026-09-19",
  packageName: "vite",
  acceptedVersion: "8.3.0",
  candidateVersion: "9.0.0",
  sourceIdentity: "https://registry.npmjs.org/vite@9.0.0|sha256:candidate",
  releaseNotes: "Synthetic fixture: major candidate changes the accepted build tool contract.",
  isolatedCandidateRef: "candidate-worktree/vite-9.0.0",
  gates: { currentness: "PASS", license: "PASS", security: "PASS", contract: "PASS", migration: "PASS", target: "PASS" }
});

const baseEntrant = (): FossEntrantInput => ({
  entrantId: "entrant-local-query-2026-09-19",
  name: "Local Query Candidate",
  capabilityGap: "large local analytical projection",
  sourceIdentity: "https://example.invalid/local-query|sha256:fixture",
  license: "MIT",
  isolatedCandidateRef: "candidate-worktree/local-query",
  gates: { source: "PASS", license: "PASS", security: "PASS", fit: "PASS", maintenance: "PASS", target: "PASS" }
});

const baseAdvisory = (): VulnerabilityFastLaneInput => ({
  advisoryId: "OSV-FIXTURE-2026-0001",
  packageName: "optional-adapter",
  severity: "HIGH",
  affectedScope: "OPTIONAL",
  disablePathVerified: false,
  coreRegressionPass: true,
  coreDataPreserved: true
});

const baseRemoval = (): FossRemovalInput => ({ componentId: "optional-parser", retainedInputsAvailable: true, reconstruction: "PASS", boundedLimitationRecorded: false, coreRegressionPass: true, canonicalStatePreserved: true });
const baseCopyleft = (): CopyleftObligationInput => ({ componentId: "copyleft-parser", license: "MPL-2.0", noticePresent: true, correspondingSourceAvailable: true, isolationOrComplianceProven: true, legalReview: "PASS" });
const baseParity = (): UpstreamParityInput => ({ componentId: "local-search-patch", upstreamIdentity: "upstream@9.0.0|sha256:fixture", localPatchPresent: true, parity: "PASS", regression: "PASS", migration: "PASS", deltaReduced: true });
const baseCompatibility = (): CompatibilityCandidateInput => ({ capabilityId: "search-adapter", acceptedUpstreamIdentity: "upstream@8|sha256:accepted", candidateUpstreamIdentity: "upstream@9|sha256:candidate", adapterVersion: "adapter-2", changedBehavior: false, adapterUpdated: false, contract: "PASS", migration: "PASS", target: "PASS", regression: "PASS" });

describe("isolated upstream/FOSS candidate gate", () => {
  it("adopts only an isolated major candidate and keeps promotion explicit", () => {
    const input = baseCandidate();
    const before = JSON.stringify(input);
    const result = evaluateUpstreamCandidate(input);
    expect(result).toMatchObject({ decision: "ADOPT_CANDIDATE", majorUpdate: true, acceptedRuntimeUnchanged: true, promotionRequired: true, acceptedVersion: "8.3.0" });
    expect(result.reasons.join(" ")).toContain("explicit promotion");
    expect(JSON.stringify(input)).toBe(before);
  });

  it("defers a candidate when a non-policy gate is unknown or failing", () => {
    const input = { ...baseCandidate(), gates: { ...baseCandidate().gates, target: "UNKNOWN" as const } };
    const result = evaluateUpstreamCandidate(input);
    expect(result.decision).toBe("DEFER");
    expect(result.reasons.join(" ")).toContain("target=UNKNOWN");
    expect(result.acceptedRuntimeUnchanged).toBe(true);
  });

  it("rejects policy-critical license or security failure", () => {
    const input = { ...baseCandidate(), gates: { ...baseCandidate().gates, security: "FAIL" as const } };
    const result = evaluateUpstreamCandidate(input);
    expect(result.decision).toBe("REJECT");
    expect(result.reasons.join(" ")).toContain("policy-critical");
  });

  it("rejects incomplete identity and non-new versions without mutating the accepted candidate", () => {
    const missingSource = evaluateUpstreamCandidate({ ...baseCandidate(), sourceIdentity: "" });
    expect(missingSource.decision).toBe("REJECT");
    const sameVersion = evaluateUpstreamCandidate({ ...baseCandidate(), candidateVersion: "8.3.0" });
    expect(sameVersion.decision).toBe("REJECT");
    expect(sameVersion.acceptedRuntimeUnchanged).toBe(true);
  });

  it("keeps a new FOSS entrant isolated until exact fit and maintenance gates pass", () => {
    const deferred = evaluateFossEntrant({ ...baseEntrant(), gates: { ...baseEntrant().gates, maintenance: "UNKNOWN" as const } });
    expect(deferred.decision).toBe("DEFER");
    const adopted = evaluateFossEntrant(baseEntrant());
    expect(adopted.decision).toBe("ADOPT_CANDIDATE");
    expect(adopted.acceptedRuntimeUnchanged).toBe(true);
  });

  it("rejects an entrant with a policy-critical security failure", () => {
    const result = evaluateFossEntrant({ ...baseEntrant(), gates: { ...baseEntrant().gates, security: "FAIL" as const } });
    expect(result.decision).toBe("REJECT");
  });

  it("blocks a high-severity advisory when no fix or safe optional disable path is proven", () => {
    const result = evaluateVulnerabilityFastLane(baseAdvisory());
    expect(result.decision).toBe("BLOCK_RELEASE");
    expect(result.falsePassPrevented).toBe(true);
  });

  it("allows only a qualified fix or a proven optional disable path", () => {
    const disabled = evaluateVulnerabilityFastLane({ ...baseAdvisory(), disablePathVerified: true });
    expect(disabled.decision).toBe("DISABLE_OPTIONAL");
    const fixed = evaluateVulnerabilityFastLane({ ...baseAdvisory(), fixVersion: "2.0.1", fixGates: { source: "PASS", security: "PASS", contract: "PASS", target: "PASS" } });
    expect(fixed.decision).toBe("FIX_CANDIDATE");
  });

  it("continues safely after FOSS removal only with reconstruction or a bounded limitation", () => {
    expect(evaluateFossRemoval(baseRemoval()).decision).toBe("CONTINUE_RECONSTRUCTED");
    expect(evaluateFossRemoval({ ...baseRemoval(), retainedInputsAvailable: false, reconstruction: "FAIL", boundedLimitationRecorded: true }).decision).toBe("CONTINUE_WITH_BOUNDED_LIMITATION");
    expect(evaluateFossRemoval({ ...baseRemoval(), retainedInputsAvailable: false, reconstruction: "FAIL", boundedLimitationRecorded: false }).decision).toBe("BLOCK_RELEASE");
  });

  it("requires reviewed copyleft obligations or keeps the entrant isolated", () => {
    expect(evaluateCopyleftObligations(baseCopyleft()).decision).toBe("ADMIT_COMPLIANT");
    expect(evaluateCopyleftObligations({ ...baseCopyleft(), correspondingSourceAvailable: false }).decision).toBe("ISOLATE_CANDIDATE");
    expect(evaluateCopyleftObligations({ ...baseCopyleft(), isolationOrComplianceProven: false }).decision).toBe("REJECT");
  });

  it("removes a local patch only after parity, migration, regression, and delta gates pass", () => {
    expect(evaluateUpstreamParity(baseParity()).decision).toBe("REMOVE_LOCAL_PATCH");
    expect(evaluateUpstreamParity({ ...baseParity(), parity: "UNKNOWN" as const }).decision).toBe("DEFER");
    expect(evaluateUpstreamParity({ ...baseParity(), parity: "FAIL" as const }).decision).toBe("RETAIN_LOCAL_PATH");
  });

  it("detects changed upstream behavior before promotion and requires an adapter update", () => {
    expect(evaluateCompatibilityCandidate(baseCompatibility()).decision).toBe("PROMOTE_COMPATIBLE");
    expect(evaluateCompatibilityCandidate({ ...baseCompatibility(), changedBehavior: true }).decision).toBe("REJECT");
    expect(evaluateCompatibilityCandidate({ ...baseCompatibility(), changedBehavior: true, adapterUpdated: true }).decision).toBe("ADAPT_AND_PROMOTE");
    expect(evaluateCompatibilityCandidate({ ...baseCompatibility(), target: "UNKNOWN" as const }).decision).toBe("DEFER");
  });
});
