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
});
