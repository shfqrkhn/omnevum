import { describe, expect, it } from "vitest";
import { evaluateUpstreamCandidate, type UpstreamCandidateInput } from "./currentness";

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
});
