import { describe, expect, it } from "vitest";
import type { CanonicalRecord } from "./model";
import { recordText, recordTriageDisposition, recordTriageStatus } from "./domain";

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
    expect(recordTriageDisposition({ ...base, data: { triageDisposition: "ROUTE" } })).toBeUndefined();
  });
});
