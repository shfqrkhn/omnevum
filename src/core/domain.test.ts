import { describe, expect, it } from "vitest";
import type { CanonicalRecord } from "./model";
import { recordText } from "./domain";

describe("domain record projections", () => {
  it("renders an evidence claim instead of exposing an opaque relationship label", () => {
    const record = { recordType: "relationship", data: { kind: "evidence-link", claim: "Source supports the claim" } } as unknown as CanonicalRecord;
    expect(recordText(record)).toBe("Source supports the claim");
  });
});
