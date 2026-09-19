import { describe, expect, it } from "vitest";
import type { CanonicalRecord } from "./model";
import { projectFinanceState, toFinanceTransaction } from "./finance-projection";

function record(id: string, data: Record<string, unknown>, overrides: Partial<CanonicalRecord> = {}): CanonicalRecord {
  return {
    id,
    recordType: "observation",
    owner: "domain.finance",
    schemaVersion: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    modifiedAt: "2026-01-01T00:00:00.000Z",
    provenance: { source: "USER_INPUT", capturedAt: "2026-01-01T00:00:00.000Z", sourceId: id },
    truthClass: "USER_OBSERVATION",
    sensitivity: "PRIVATE",
    revision: 1,
    deleted: false,
    data,
    ...overrides
  };
}

describe("canonical Finance projection", () => {
  it("normalizes captured positive expenses as outflows without changing their owner or value", () => {
    const expense = record("expense-1", { kind: "expense", merchant: "Transit", amountMinor: "1250", currency: "CAD", text: "Transit" });
    const transaction = toFinanceTransaction(expense);
    expect(transaction).toMatchObject({ id: "expense-1", direction: "OUTFLOW", accountId: "captured-expenses", amount: { amountMinor: "-1250", currency: "CAD" } });
    expect(expense.data.amountMinor).toBe("1250");
  });

  it("projects canonical transactions and typed graph impact together", () => {
    const income = record("income-1", { kind: "finance-transaction", merchant: "payroll", description: "Payroll", amountMinor: "300000", currency: "CAD", accountId: "checking", postedAt: "2026-01-02T00:00:00.000Z", status: "POSTED", naturalKey: "income" }, { truthClass: "IMPORTED_RECORD", provenance: { source: "IMPORT", capturedAt: "2026-01-03T00:00:00.000Z", sourceId: "statement-1" } });
    const expense = record("expense-1", { kind: "expense", merchant: "rent", amountMinor: "100000", currency: "CAD", text: "Rent" });
    const goal = record("goal-1", { kind: "goal", label: "reserve", text: "Reserve" }, { owner: "core.capture", recordType: "note" });
    const link: CanonicalRecord = record("link-1", { kind: "dependency-link", version: 1, sourceId: "expense-1", targetId: "goal-1", edgeKind: "DEPENDENCY", status: "ACTIVE", label: "funds reserve", text: "expense-1 -> goal-1: funds reserve" }, { recordType: "relationship", owner: "platform.dependency", truthClass: "USER_OBSERVATION" });
    const projection = projectFinanceState([income, expense, goal, link], { requiredPeriods: ["2026-01"], changedIds: ["expense-1"] });
    expect(projection.status).toBe("LIMITED");
    expect(projection.summary?.postedIncome.amountMinor).toBe("300000");
    expect(projection.summary?.postedSpending.amountMinor).toBe("100000");
    expect(projection.summary?.netCashFlow.amountMinor).toBe("200000");
    expect(projection.financeGraph.nodes.map((node) => node.id)).toEqual(["expense-1", "goal-1", "income-1"]);
    expect(projection.financeGraph.edges).toMatchObject([{ from: "expense-1", to: "goal-1", kind: "DEPENDENCY" }]);
    expect(projection.dependencyImpact.affectedIds).toEqual(["expense-1", "goal-1"]);
    expect(projection.invalidatedFinanceIds).toEqual(["goal-1"]);
    expect(projection.quality.missingPeriods).toEqual([]);
    expect(projection.sourceIds).toEqual(["expense-1", "statement-1"]);
  });

  it("keeps unsupported currencies visible as separate summaries and never invents a default", () => {
    const usd = record("usd-1", { kind: "finance-transaction", merchant: "broker", description: "Broker", amountMinor: "1000", currency: "USD", accountId: "brokerage", postedAt: "2026-01-02T00:00:00.000Z" });
    const projection = projectFinanceState([usd], { currency: "EUR" });
    expect(projection.currency).toBeUndefined();
    expect(projection.summary).toBeUndefined();
    expect(projection.summariesByCurrency.USD?.postedIncome.amountMinor).toBe("1000");
    expect(projection.status).toBe("LIMITED");
  });
});
