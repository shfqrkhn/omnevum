import { describe, expect, it } from "vitest";
import { CommandBus } from "./commands";
import { projectRecordsInSpace, SpaceService } from "./space";
import { CanonicalStore } from "./storage";

describe("Space/Scope reference overlay", () => {
  it("places one canonical record in multiple spaces without copying it", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-spaces`);
    await store.open();
    const commands = new CommandBus(store);
    const service = new SpaceService(store, commands);
    const source = await commands.create({ recordType: "note", owner: "core.capture", data: { text: "shared source", space: "personal" } });
    const household = await service.add(source.id, "household");
    const work = await service.add(source.id, "work");
    const records = await store.list();
    expect(records.filter((record) => record.id === source.id)).toHaveLength(1);
    expect((await service.project(records, "household")).map((record) => record.id)).toEqual([source.id]);
    expect((await service.project(records, "work")).map((record) => record.id)).toEqual([source.id]);
    await service.remove(household.id);
    expect((await service.project(await store.list(), "household")).map((record) => record.id)).toEqual([]);
    expect(await store.get(source.id)).toEqual(source);
    expect(work.data.kind).toBe("space-membership");
    store.close();
  });

  it("uses the record's default space only when no explicit membership exists", () => {
    const source = { id: "source", recordType: "note", owner: "core.capture", schemaVersion: 1, createdAt: "2026-01-01T00:00:00.000Z", modifiedAt: "2026-01-01T00:00:00.000Z", provenance: { source: "USER_INPUT", capturedAt: "2026-01-01T00:00:00.000Z" }, truthClass: "USER_OBSERVATION", sensitivity: "PRIVATE", revision: 1, deleted: false, data: { text: "source", space: "work" } } as const;
    expect(projectRecordsInSpace([source], [], "work")).toEqual([source]);
  });

  it("creates and removes a user-defined Space without deleting canonical records", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-custom-space`);
    await store.open();
    const commands = new CommandBus(store);
    const service = new SpaceService(store, commands);
    const source = await commands.create({ recordType: "note", owner: "core.capture", data: { text: "trip source" } });
    const custom = await service.create("Trip");
    expect(custom.builtIn).toBe(false);
    expect((await service.listSpaces()).find((space) => space.id === custom.id)?.name).toBe("Trip");
    await expect(service.create(" trip ")).rejects.toThrow("already exists");
    const membership = await service.add(source.id, custom.id);
    expect((await service.project(await store.list(), custom.id)).map((record) => record.id)).toEqual([source.id]);

    await service.removeSpace(custom.id);
    expect((await service.listSpaces()).some((space) => space.id === custom.id)).toBe(false);
    expect((await service.project(await store.list(), custom.id)).map((record) => record.id)).toEqual([]);
    expect(await store.get(source.id)).toEqual(source);
    expect((await store.get(membership.id, true))?.data.status).toBe("REMOVED");
    expect((await store.get(custom.recordId!, true))?.deleted).toBe(true);
    store.close();
  });
});
