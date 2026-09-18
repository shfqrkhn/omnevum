import { describe, expect, it } from "vitest";
import { CommandBus } from "./commands";
import { diffRecords, historyWithDiffs, revertToRevision } from "./history";
import type { CanonicalRecord } from "./model";
import { CanonicalStore } from "./storage";

function record(id: string): CanonicalRecord {
  const now = new Date().toISOString();
  return { id, recordType: "note", owner: "core.capture", schemaVersion: 1, createdAt: now, modifiedAt: now, provenance: { source: "USER_INPUT", capturedAt: now }, truthClass: "USER_OBSERVATION", sensitivity: "PRIVATE", revision: 1, deleted: false, data: { text: "before", nested: { value: 1 } } };
}

describe("History/Version", () => {
  it("produces field-level diffs without creating a writable copy", async () => {
    const before = record("history");
    const after = { ...before, revision: 2, data: { text: "after", nested: { value: 1 } } };
    expect(diffRecords(before, after).map((change) => change.path)).toContain("data.text");
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-history-diff`);
    await store.open();
    await store.put(before);
    await store.put(after);
    expect((await historyWithDiffs(store, before.id))[1]?.changesFromPrevious.map((change) => change.path)).toContain("data.text");
    store.close();
  });

  it("reverts through a new canonical revision", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-history-revert`);
    await store.open();
    const commands = new CommandBus(store);
    const created = await commands.create({ recordType: "note", owner: "core.capture", data: { text: "before" } });
    await commands.update(created.id, { text: "after" });
    const reverted = await revertToRevision(commands, store, created.id, 1);
    expect(reverted.data.text).toBe("before");
    expect(reverted.revision).toBe(3);
    store.close();
  });
});
