import { describe, expect, it } from "vitest";
import { CommandBus } from "./commands";
import { captureExpense, captureHealthMeasurement } from "./workflows";
import { CanonicalStore } from "./storage";

describe("first-party domain workflows", () => {
  it("captures exact-currency finance data through the command owner", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-finance`);
    await store.open();
    const record = await captureExpense(new CommandBus(store), { merchant: "Transit", amount: "12.50", currency: "CAD", space: "personal" });
    expect(record.owner).toBe("domain.finance");
    expect(record.data.amountMinor).toBe("1250");
    store.close();
  });

  it("requires explicit subject identity for health data", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-health-workflow`);
    await store.open();
    await expect(captureHealthMeasurement(new CommandBus(store), { metric: "resting heart rate", value: 62, unit: "bpm", space: "personal", subjectId: "person:self" })).resolves.toMatchObject({ owner: "domain.health", subjectId: "person:self" });
    await expect(captureHealthMeasurement(new CommandBus(store), { metric: "sleep", value: 8, space: "personal", subjectId: "" })).rejects.toThrow("subject");
    store.close();
  });
});
