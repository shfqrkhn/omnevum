import { describe, expect, it } from "vitest";
import { CommandBus } from "./commands";
import { captureExpense, captureFinancePlan, captureHealthMeasurement } from "./workflows";
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

  it("persists Finance resources and goals as one canonical owner", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-finance-plan`);
    await store.open();
    const commands = new CommandBus(store);
    const resource = await captureFinancePlan(commands, { kind: "resource", label: "Monthly surplus", amount: "100.00", currency: "CAD", space: "personal" });
    const goal = await captureFinancePlan(commands, { kind: "goal", label: "Emergency reserve", amount: "1000.00", currency: "CAD", space: "personal", targetDate: "2030-01-01", sustainableMonthlySurplus: "100.00", hardConstraint: true });
    expect(resource).toMatchObject({ owner: "domain.finance", data: { kind: "finance-resource", amountMinor: "10000", currency: "CAD" } });
    expect(goal).toMatchObject({ owner: "domain.finance", truthClass: "ASSUMPTION", data: { kind: "finance-goal", targetAmountMinor: "100000", targetDate: "2030-01-01", sustainableMonthlySurplusMinor: "10000", hardConstraint: true } });
    expect(new Set((await commands.list()).map((record) => record.id))).toEqual(new Set([resource.id, goal.id]));
    store.close();
  });

  it("persists a rolling essential-month goal without inventing a fixed target", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-rolling-goal`);
    await store.open();
    const commands = new CommandBus(store);
    const goal = await captureFinancePlan(commands, { kind: "goal", label: "Emergency reserve", amount: "", currency: "CAD", space: "personal", targetMode: "ROLLING_ESSENTIAL_MONTHS", essentialMonths: 6 });
    expect(goal.data).toMatchObject({ kind: "finance-goal", targetKind: "ROLLING_ESSENTIAL_MONTHS", targetMonths: 6, currency: "CAD" });
    expect(goal.data).not.toHaveProperty("targetAmountMinor");
    store.close();
  });
});
