import { describe, expect, it } from "vitest";
import { assertViewDefinition, projectView, type ViewDefinition } from "./compose";
import type { CanonicalRecord } from "./model";

function record(id: string, space: "personal" | "household" | "work"): CanonicalRecord {
  const now = new Date().toISOString();
  return { id, recordType: "note", owner: "core.capture", schemaVersion: 1, createdAt: now, modifiedAt: now, provenance: { source: "USER_INPUT", capturedAt: now }, truthClass: "USER_OBSERVATION", sensitivity: "PRIVATE", revision: 1, deleted: false, data: { text: id, space } };
}

describe("Compose/View", () => {
  it("validates and projects a declarative view without owning records", () => {
    const view: ViewDefinition = { schemaVersion: 1, id: "work-list", title: "Work", recordType: "note", space: "work", widgets: [{ id: "list", type: "list", title: "Notes", fields: ["text"] }], layout: "stack", source: "USER" };
    assertViewDefinition(view);
    expect(projectView(view, [record("one", "work"), record("two", "personal")]).map((item) => item.id)).toEqual(["one"]);
  });

  it("rejects executable or oversized view definitions", () => {
    expect(() => assertViewDefinition({ schemaVersion: 1, id: "bad", title: "Bad", layout: "stack", source: "USER", widgets: [{ id: "code", type: "script", title: "No" }] })).toThrow("Invalid");
  });
});
