import { describe, expect, it } from "vitest";
import { CommandBus, RevisionConflictError, runTriageBatch } from "./commands";
import { previewCleanup, reconstructCleanupHistory, type CleanupRecipe } from "./cleanup";
import { CanonicalStore } from "./storage";

describe("CommandBus", () => {
  it("creates a user-owned canonical record through one owner path", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-commands`);
    await store.open();
    const commands = new CommandBus(store);
    const created = await commands.create({ recordType: "note", owner: "core.capture", data: { text: "one path" } });
    expect(created.owner).toBe("core.capture");
    expect(created.provenance.source).toBe("USER_INPUT");
    expect(await store.list()).toEqual([created]);
    store.close();
  });

  it("rejects a mutation without a canonical owner", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-owner`);
    await store.open();
    const commands = new CommandBus(store);
    await expect(commands.create({ recordType: "note", owner: "", data: { text: "blocked" } })).rejects.toThrow("canonical owner");
    store.close();
  });

  it("undoes the latest material change as a new revision", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-undo`);
    await store.open();
    const commands = new CommandBus(store);
    const created = await commands.create({ recordType: "note", owner: "core.capture", data: { text: "before" } });
    await commands.update(created.id, { text: "after" });
    const restored = await commands.undo(created.id);
    expect(restored.data.text).toBe("before");
    expect(restored.revision).toBe(3);
    store.close();
  });

  it("rejects a stale conditional mutation instead of overwriting a newer revision", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-conflict`);
    await store.open();
    const commands = new CommandBus(store);
    const created = await commands.create({ recordType: "note", owner: "core.capture", data: { text: "before" } });
    await commands.update(created.id, { text: "newer" });
    await expect(commands.update(created.id, { text: "stale" }, created.revision)).rejects.toBeInstanceOf(RevisionConflictError);
    expect((await store.get(created.id))?.data.text).toBe("newer");
    store.close();
  });

  it("updates editable text through the command owner and invalidates only derived search state", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-text-edit`);
    await store.open();
    const commands = new CommandBus(store);
    const created = await commands.create({ recordType: "note", owner: "core.capture", data: { text: "before" } });
    await store.rebuildSearchIndex();
    expect((await store.health()).searchIndexValid).toBe(true);

    const updated = await commands.updateText(created.id, "after", created.revision);
    expect(updated.data.text).toBe("after");
    expect(updated.revision).toBe(2);
    expect((await store.get(updated.id))?.data.text).toBe("after");
    expect((await store.health()).searchIndexValid).toBe(false);
    await expect(commands.updateText(created.id, "stale", created.revision)).rejects.toBeInstanceOf(RevisionConflictError);

    const relationship = await commands.create({ recordType: "relationship", owner: "platform.relate", data: { text: "reference" } });
    await expect(commands.updateText(relationship.id, "not allowed")).rejects.toThrow("editable text field");
    store.close();
  });

  it("stores cross-domain relationships as explicit reference records", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-relate`);
    await store.open();
    const commands = new CommandBus(store);
    const source = await commands.create({ recordType: "note", owner: "core.capture", data: { text: "source" } });
    const target = await commands.create({ recordType: "task", owner: "core.capture", data: { text: "target", status: "OPEN" } });
    const relationship = await commands.relate(source.id, target.id, "supports");
    expect(relationship.owner).toBe("platform.relate");
    expect(relationship.recordType).toBe("relationship");
    expect(relationship.data).toMatchObject({ sourceId: source.id, targetId: target.id, relation: "supports" });
    store.close();
  });

  it("links a triage item idempotently and closes it without copying the source", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-triage-link`);
    await store.open();
    const commands = new CommandBus(store);
    const source = await commands.create({ recordType: "note", owner: "core.capture", data: { text: "inbox", triageStatus: "INBOX" } });
    const target = await commands.create({ recordType: "note", owner: "core.capture", data: { text: "existing", triageStatus: "REVIEWED" } });
    const relationship = await commands.linkTriage(source.id, target.id, "supports", source.revision);
    const linked = await store.get(source.id);
    expect(linked?.data).toMatchObject({ triageStatus: "REVIEWED", triageDisposition: "LINKED", triageLinkId: relationship.id });
    expect((await store.list()).filter((record) => record.recordType === "relationship")).toHaveLength(1);
    await commands.linkTriage(source.id, target.id, "supports", linked?.revision);
    expect((await store.list()).filter((record) => record.recordType === "relationship")).toHaveLength(1);
    store.close();
  });

  it("routes a triage item into an explicit task owner while archiving the staging source", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-triage-route`);
    await store.open();
    const commands = new CommandBus(store);
    const source = await commands.create({ recordType: "note", owner: "core.capture", data: { text: "route me", triageStatus: "CLARIFY" } });
    const routed = await commands.routeTriage(source.id, "task", source.revision);
    expect(routed.recordType).toBe("task");
    expect(routed.data).toMatchObject({ text: "route me", status: "OPEN", triageStatus: "REVIEWED", triageDisposition: "ROUTED", triageSourceId: source.id });
    expect(routed.provenance.sourceId).toBe(source.id);
    expect((await store.get(source.id, true))?.deleted).toBe(true);
    expect((await store.list()).map((record) => record.id)).toEqual([routed.id]);
    store.close();
  });

  it("splits one triage source into bounded canonical parts and closes the staging source idempotently", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-triage-split`);
    await store.open();
    const commands = new CommandBus(store);
    const source = await commands.create({ recordType: "note", owner: "core.capture", truthClass: "SOURCE_CLAIM", sensitivity: "SHARED", data: { text: "mixed source", space: "work", triageStatus: "CLARIFY" } });
    const parts = [{ target: "note" as const, text: "Keep the quoted context" }, { target: "task" as const, text: "Verify the follow-up" }];
    const children = await commands.splitTriage(source.id, parts, source.revision);
    expect(children).toHaveLength(2);
    expect(children.map((record) => record.recordType)).toEqual(["note", "task"]);
    expect(children[0]!.provenance).toMatchObject({ source: "USER_INPUT", sourceId: source.id });
    expect(children[1]!.data).toMatchObject({ status: "OPEN", triageDisposition: "SPLIT", triageSourceId: source.id, triageSplitIndex: 1, triageSplitCount: 2 });
    expect((await store.get(source.id, true))?.deleted).toBe(true);
    expect((await store.list()).map((record) => record.id).sort()).toEqual(children.map((record) => record.id).sort());
    const retried = await commands.splitTriage(source.id, parts);
    expect(retried.map((record) => record.id)).toEqual(children.map((record) => record.id));
    expect((await store.list()).filter((record) => record.data.triageSplitSourceId === source.id)).toHaveLength(2);
    store.close();
  });

  it("defers a triage source until an explicit due time and clears stale disposition", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-triage-defer`);
    await store.open();
    const commands = new CommandBus(store);
    const source = await commands.create({ recordType: "note", owner: "core.capture", data: { text: "defer me", triageStatus: "INBOX", triageDisposition: "REFERENCE" } });
    const deferred = await commands.deferTriage(source.id, "2030-01-01T12:00:00.000Z", source.revision);
    expect(deferred.data).toMatchObject({ triageStatus: "DEFERRED", triageDeferredUntil: "2030-01-01T12:00:00.000Z" });
    expect(deferred.data.triageDisposition).toBeUndefined();
    await expect(commands.deferTriage(source.id, "invalid", deferred.revision)).rejects.toThrow("defer time");
    store.close();
  });

  it("records an explicit triage delete disposition before archiving the source for recovery", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-triage-delete`);
    await store.open();
    const commands = new CommandBus(store);
    const source = await commands.create({ recordType: "note", owner: "core.capture", data: { text: "discard me", triageStatus: "INBOX" } });
    await commands.deleteTriage(source.id, source.revision);
    const deleted = await store.get(source.id, true);
    expect(deleted?.deleted).toBe(true);
    expect(deleted?.data).toMatchObject({ triageStatus: "REVIEWED", triageDisposition: "DELETED" });
    expect(await store.list()).toEqual([]);
    store.close();
  });

  it("reports per-item triage batch outcomes and retains a stale failure in staging", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-triage-batch`);
    await store.open();
    const commands = new CommandBus(store);
    const sources = await Promise.all(["one", "two", "three", "four"].map((text) => commands.create({ recordType: "note", owner: "core.capture", data: { text, triageStatus: "INBOX" } })));
    const items = sources.map((source) => ({ recordId: source.id, expectedRevision: source.revision }));
    await commands.update(sources[3]!.id, { text: "four changed", triageStatus: "INBOX" }, sources[3]!.revision);
    const outcomes = await runTriageBatch(commands, items, "REVIEW");
    expect(outcomes.filter((outcome) => outcome.ok).map((outcome) => outcome.recordId)).toEqual(sources.slice(0, 3).map((source) => source.id));
    expect(outcomes[3]).toMatchObject({ recordId: sources[3]!.id, ok: false });
    expect((await store.get(sources[0]!.id))?.data.triageStatus).toBe("REVIEWED");
    expect((await store.get(sources[3]!.id))?.data.triageStatus).toBe("INBOX");
    store.close();
  });

  it("applies cleanup through the canonical command path and stores replayable history", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-cleanup-apply`);
    await store.open();
    const commands = new CommandBus(store);
    const recipe: CleanupRecipe = { schemaVersion: 1, recipeId: "ui-cleanup", name: "UI cleanup", operations: [{ kind: "TRIM_TEXT" }, { kind: "NORMALIZE_WHITESPACE" }] };
    const first = await commands.create({ recordType: "note", owner: "platform.acquire", truthClass: "IMPORTED_RECORD", provenance: { source: "IMPORT", sourceId: "source:a" }, data: { text: "  Same   note ", sourceFields: { externalId: "A-1" } } });
    const duplicate = await commands.create({ recordType: "note", owner: "platform.acquire", truthClass: "IMPORTED_RECORD", provenance: { source: "IMPORT", sourceId: "source:b" }, data: { text: "Same note", sourceFields: { externalId: "B-1" } } });
    const conflicting = await commands.create({ recordType: "note", owner: "platform.acquire", truthClass: "IMPORTED_RECORD", provenance: { source: "IMPORT", sourceId: "source:c" }, data: { text: "Different note", sourceFields: { externalId: "A-1" } } });
    const preview = previewCleanup([first, duplicate, conflicting], recipe);
    const exact = preview.proposals.find((proposal) => proposal.kind === "EXACT_DUPLICATE");
    const ambiguous = preview.proposals.find((proposal) => proposal.kind === "AMBIGUOUS_MATCH");
    expect(exact).toBeDefined();
    expect(ambiguous).toBeDefined();
    const historyRecords = await commands.applyCleanup(preview, [
      { proposalId: "cleanup:transform:" + first.id, action: "APPLY_TRANSFORM" },
      { proposalId: exact!.proposalId, action: "ARCHIVE_EXACT_DUPLICATE", archiveRecordIds: [duplicate.id] },
      { proposalId: ambiguous!.proposalId, action: "MARK_REVIEW" }
    ]);
    const updated = await store.get(first.id);
    expect(updated?.data.text).toBe("Same note");
    expect((await store.get(duplicate.id, true))?.deleted).toBe(true);
    expect((await store.get(conflicting.id))?.data.cleanupReview).toEqual(expect.objectContaining({ replayFingerprint: preview.replayFingerprint }));
    const historyId = String(historyRecords[0]?.data.historyId);
    const history = reconstructCleanupHistory(await store.list(true), historyId);
    expect(history?.receipt.replayFingerprint).toBe(preview.replayFingerprint);
    expect(history?.outcome.archivedRecordIds).toEqual([duplicate.id]);
    expect((await store.exportVault()).records.filter((record) => record.data.kind === "cleanup-history")).toHaveLength(historyRecords.length);
    store.close();
  });
});
