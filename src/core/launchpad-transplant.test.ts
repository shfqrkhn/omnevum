import { describe, expect, it } from "vitest";
import {
  CANONICAL_OWNER_BY_FLOW,
  V018_LAUNCHPAD_FLOWS,
  assertSixFlowCoverage,
  canonicalOwnerForFlow,
  evaluateOwnershipBoundary,
  validateCanonicalFlowInput
} from "./launchpad-transplant";

describe("v0.18 launchpad transplant boundary", () => {
  it("defines one Omnevum owner for every required flow", () => {
    assertSixFlowCoverage(V018_LAUNCHPAD_FLOWS);
    expect(new Set(Object.values(CANONICAL_OWNER_BY_FLOW)).size).toBe(V018_LAUNCHPAD_FLOWS.length);
    expect(canonicalOwnerForFlow("Document/Artifact")).toBe("core.artifact");
  });

  it("routes candidate meaning through a stable command mutation", () => {
    expect(validateCanonicalFlowInput({
      flow: "Note/Knowledge",
      sourceId: "neumanos:note:42",
      recordId: "omnevum:note:42",
      revision: 1,
      data: { text: "retain this behavior" }
    })).toEqual({
      command: "record.create",
      owner: "core.knowledge",
      flow: "Note/Knowledge",
      sourceId: "neumanos:note:42",
      recordId: "omnevum:note:42",
      expectedRevision: 1,
      data: { text: "retain this behavior" }
    });
  });

  it("rejects duplicate writable candidate authority", () => {
    const result = evaluateOwnershipBoundary([
      { storeId: "candidate-notes", flow: "Note/Knowledge", writable: true, owner: "candidate.notes" }
    ], "Note/Knowledge");
    expect(result.accepted).toBe(false);
    expect(result.reasons).toEqual([
      "candidate exposes a writable store for a meaning owned by Omnevum",
      "candidate store declares a conflicting semantic owner"
    ]);
  });

  it("allows a read-only retained candidate seam with the Omnevum owner", () => {
    expect(evaluateOwnershipBoundary([
      { storeId: "candidate-automation", flow: "Automation", writable: false, owner: "core.automation" }
    ], "Automation")).toEqual({
      accepted: true,
      owner: "core.automation",
      reasons: []
    });
  });
});
