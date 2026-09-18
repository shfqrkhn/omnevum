import { describe, expect, it } from "vitest";
import type { CanonicalRecord } from "./model";
import { proposeTriage, recordText, recordTriageDeferredUntil, recordTriageDisposition, recordTriageStatus } from "./domain";

describe("domain record projections", () => {
  it("renders an evidence claim instead of exposing an opaque relationship label", () => {
    const record = { recordType: "relationship", data: { kind: "evidence-link", claim: "Source supports the claim" } } as unknown as CanonicalRecord;
    expect(recordText(record)).toBe("Source supports the claim");
  });

  it("preserves explicit triage states and defaults malformed values to the inbox", () => {
    const base = { recordType: "note", data: {} } as unknown as CanonicalRecord;
    expect(recordTriageStatus(base)).toBe("INBOX");
    expect(recordTriageStatus({ ...base, data: { triageStatus: "CLARIFY" } })).toBe("CLARIFY");
    expect(recordTriageStatus({ ...base, data: { triageStatus: "DEFERRED" } })).toBe("DEFERRED");
    expect(recordTriageStatus({ ...base, data: { triageStatus: "unknown" } })).toBe("INBOX");
  });

  it("recognizes only the explicit reference disposition", () => {
    const base = { recordType: "note", data: {} } as unknown as CanonicalRecord;
    expect(recordTriageDisposition({ ...base, data: { triageDisposition: "REFERENCE" } })).toBe("REFERENCE");
    expect(recordTriageDisposition({ ...base, data: { triageDisposition: "LINKED" } })).toBe("LINKED");
    expect(recordTriageDisposition({ ...base, data: { triageDisposition: "ROUTED" } })).toBe("ROUTED");
    expect(recordTriageDisposition({ ...base, data: { triageDisposition: "SPLIT" } })).toBe("SPLIT");
    expect(recordTriageDisposition({ ...base, data: { triageDisposition: "DELETED" } })).toBe("DELETED");
    expect(recordTriageDisposition({ ...base, data: { triageDisposition: "ROUTE" } })).toBeUndefined();
    expect(recordTriageDeferredUntil({ ...base, data: { triageDeferredUntil: "2030-01-01T00:00:00.000Z" } })).toBe("2030-01-01T00:00:00.000Z");
    expect(recordTriageDeferredUntil({ ...base, data: { triageDeferredUntil: "not-a-time" } })).toBeUndefined();
  });

  it("projects non-committing owner, type, and action proposals for an ambiguous note", () => {
    const source = { id: "source-1", owner: "core.capture", recordType: "note" } as unknown as CanonicalRecord;
    expect(proposeTriage(source)).toEqual({
      sourceId: "source-1",
      possibleOwners: ["core.capture"],
      possibleTypes: ["note", "task"],
      possibleActions: ["REVIEW", "CLARIFY", "DEFER", "REFERENCE", "LINK", "ROUTE", "SPLIT", "DELETE"],
      basis: "AMBIGUOUS_OR_UNRESOLVED"
    });
  });
});
