import { describe, expect, it } from "vitest";
import type { CanonicalRecord } from "./model";
import { assessTextAnchor } from "./annotation";

function annotation(anchor: Record<string, unknown>): CanonicalRecord {
  const now = new Date().toISOString();
  return { id: "annotation", recordType: "note", owner: "platform.annotate", schemaVersion: 1, createdAt: now, modifiedAt: now, provenance: { source: "USER_INPUT", capturedAt: now }, truthClass: "USER_OBSERVATION", sensitivity: "PRIVATE", revision: 1, deleted: false, data: { kind: "text-annotation", anchor } };
}

describe("source-linked annotations", () => {
  it("distinguishes active, stale, and orphan anchors", () => {
    expect(assessTextAnchor(annotation({ quote: "hello", start: 0, end: 5, sourceRevision: 1 }), "hello world", 1)).toBe("ACTIVE");
    expect(assessTextAnchor(annotation({ quote: "hello", sourceRevision: 1 }), "say hello", 2)).toBe("STALE");
    expect(assessTextAnchor(annotation({ quote: "hello", sourceRevision: 1 }), "goodbye", 2)).toBe("ORPHANED");
  });
});
