import { describe, expect, it } from "vitest";
import { CommandBus, RevisionConflictError } from "./commands";
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
});
