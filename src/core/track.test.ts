import { describe, expect, it } from "vitest";
import { CommandBus } from "./commands";
import { TrackService } from "./track";
import { CanonicalStore } from "./storage";

describe("Track/Observe", () => {
  it("reuses one canonical definition across observations", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-track`);
    await store.open();
    const service = new TrackService(store, new CommandBus(store));
    const definition = await service.define({ name: "Sleep", valueType: "NUMBER", unit: "hours", space: "personal" });
    const same = await service.define({ name: " sleep ", valueType: "NUMBER", unit: "hours", space: "personal" });
    const observation = await service.observe(definition, 7.5);
    expect(same.id).toBe(definition.id);
    expect(observation.data).toMatchObject({ definitionId: definition.id, value: 7.5, unit: "hours" });
    expect((await store.list()).filter((record) => record.owner === "platform.track")).toHaveLength(2);
    store.close();
  });

  it("rejects a value that violates the definition", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-track-invalid`);
    await store.open();
    const service = new TrackService(store, new CommandBus(store));
    const definition = await service.define({ name: "Steps", valueType: "NUMBER", space: "personal" });
    await expect(service.observe(definition, "many")).rejects.toThrow("finite number");
    store.close();
  });
});
