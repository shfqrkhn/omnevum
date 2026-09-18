import { describe, expect, it } from "vitest";
import { CapabilityRuntime } from "./capability-runtime";

describe("capability runtime", () => {
  it("starts unrelated modules when one module fails", async () => {
    const events: string[] = [];
    const runtime = new CapabilityRuntime([
      { id: "core.home", critical: true, start: () => { events.push("home"); } },
      { id: "optional.parser", start: () => { throw new Error("parser unavailable\nsecret-shaped detail"); } },
      { id: "core.recovery", critical: true, start: () => { events.push("recovery"); } }
    ]);

    const statuses = await runtime.start(undefined);

    expect(events).toEqual(["home", "recovery"]);
    expect(statuses.map((status) => [status.id, status.state])).toEqual([
      ["core.home", "READY"],
      ["optional.parser", "DEGRADED"],
      ["core.recovery", "READY"]
    ]);
    expect(statuses[1]?.reason).toBe("parser unavailable secret-shaped detail");
  });

  it("contains runtime failures to the capability that owns the operation", async () => {
    const runtime = new CapabilityRuntime([{ id: "core.search", start: () => undefined }, { id: "core.recovery", start: () => undefined }]);
    await runtime.start(undefined);

    await expect(runtime.run("core.search", async () => { throw new Error("index corrupt"); })).rejects.toThrow("index corrupt");
    expect(runtime.snapshot().find((status) => status.id === "core.search")?.state).toBe("DEGRADED");
    expect(await runtime.run("core.recovery", () => "recovery remains available")).toBe("recovery remains available");
  });

  it("fails closed for unknown or malformed module identities", async () => {
    expect(() => new CapabilityRuntime([{ id: "Bad", start: () => undefined }])).toThrow("registry is invalid");
    const runtime = new CapabilityRuntime([{ id: "core.recovery", start: () => undefined }]);
    await expect(runtime.run("core.recovery", () => "not started")).rejects.toThrow("unavailable");
    expect(() => runtime.disable("unknown", "no such module")).toThrow("unknown");
  });
});
