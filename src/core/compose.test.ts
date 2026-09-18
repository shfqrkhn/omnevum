import { describe, expect, it } from "vitest";
import { assertViewDefinition, makeUserDashboard, projectView, ViewRegistry, type ViewDefinition } from "./compose";
import type { CanonicalRecord } from "./model";
import { CanonicalStore } from "./storage";

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

  it("persists a bounded dashboard definition without storing canonical records", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-views`);
    await store.open();
    const registry = new ViewRegistry(store);
    const view = makeUserDashboard("My dashboard", ["recordType", "data.text"], "work");
    await registry.save(view);
    expect(await registry.list()).toEqual([view]);
    expect(await store.list()).toEqual([]);
    const destination = new CanonicalStore(`omnevum-test-${Date.now()}-views-destination`);
    await destination.open();
    expect(await destination.importVault(await store.exportVault())).toEqual({ imported: 0, skipped: 0, conflicts: 0 });
    expect(await new ViewRegistry(destination).list()).toEqual([view]);
    await registry.remove(view.id);
    expect(await registry.list()).toEqual([]);
    store.close();
    destination.close();
  });

  it("rejects unsafe dashboard field paths", () => {
    expect(() => makeUserDashboard("Unsafe", ["__proto__.polluted"])).toThrow("safe field");
  });
});
