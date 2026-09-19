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

  it("reconciles exact-money allocation edges against one canonical resource", () => {
    const resource = record("resource-1", { kind: "finance-resource", label: "surplus", text: "Surplus", amountMinor: "10000", currency: "CAD" });
    const goalA = record("goal-a", { kind: "goal", text: "Emergency" }, { owner: "core.capture", recordType: "note" });
    const goalB = record("goal-b", { kind: "goal", text: "Home" }, { owner: "core.capture", recordType: "note" });
    const allocationA = record("allocation-a", { kind: "dependency-link", version: 1, sourceId: resource.id, targetId: goalA.id, edgeKind: "ALLOCATION", allocationMode: "EXCLUSIVE", allocation: { amountMinor: "7000", currency: "CAD" }, status: "ACTIVE", label: "reserve", text: "allocation" }, { recordType: "relationship", owner: "platform.dependency" });
    const allocationB = record("allocation-b", { kind: "dependency-link", version: 1, sourceId: resource.id, targetId: goalB.id, edgeKind: "ALLOCATION", allocationMode: "EXCLUSIVE", allocation: { amountMinor: "5000", currency: "CAD" }, status: "ACTIVE", label: "home", text: "allocation" }, { recordType: "relationship", owner: "platform.dependency" });
    const projection = projectFinanceState([resource, goalA, goalB, allocationA, allocationB]);
    expect(projection.financeAllocationResults).toHaveLength(1);
    expect(projection.financeAllocationResults[0]?.result.overAllocated.amountMinor).toBe("2000");
    expect(projection.financeAllocationResults[0]?.result.conflictIds).toEqual(["RESOURCE_OVER_ALLOCATED"]);
    expect(projection.financeGraph.edges.some((edge) => edge.allocation?.currency === "CAD" && edge.allocation.amountMinor === "7000")).toBe(true);
  });

  it("projects canonical Finance goals from shared resource allocations", () => {
    const resource = record("resource-1", { kind: "finance-resource", label: "surplus", text: "Surplus", amountMinor: "10000", currency: "CAD" });
    const goal = record("finance-goal-1", { kind: "finance-goal", label: "Emergency", text: "Emergency", targetAmountMinor: "15000", currency: "CAD", targetDate: "2099-01-01", sustainableMonthlySurplusMinor: "1000" });
    const allocation = record("allocation-1", { kind: "dependency-link", version: 1, sourceId: resource.id, targetId: goal.id, edgeKind: "ALLOCATION", allocationMode: "EXCLUSIVE", allocation: { amountMinor: "7000", currency: "CAD" }, status: "ACTIVE", label: "reserve", text: "allocation" }, { recordType: "relationship", owner: "platform.dependency" });
    const projection = projectFinanceState([resource, goal, allocation]);
    expect(projection.financeGoalPlans).toHaveLength(1);
    expect(projection.financeGoalPlans[0]?.plan).toMatchObject({ goalId: goal.id, funded: { amountMinor: "7000", currency: "CAD" }, remaining: { amountMinor: "8000", currency: "CAD" }, fundingConflict: false });
  });

  it("projects a portfolio funding conflict once and exposes review-only alternatives", () => {
    const reserve = record("finance-goal-reserve", { kind: "finance-goal", label: "Emergency reserve", text: "Emergency reserve", targetAmountMinor: "120000", currency: "CAD", targetDate: "2027-01-01", sustainableMonthlySurplusMinor: "50000" });
    const travel = record("finance-goal-travel", { kind: "finance-goal", label: "Travel", text: "Travel", targetAmountMinor: "120000", currency: "CAD", targetDate: "2027-01-01", sustainableMonthlySurplusMinor: "50000" });
    const projection = projectFinanceState([reserve, travel]);
    expect(projection.financeFundingAnalysis).toMatchObject({ currency: "CAD", fundingConflict: true, hardConstraintConflict: false, alternatives: [{ id: "PROPORTIONAL_SOFT_GOALS" }, { id: "DEFER_SOFT_GOALS" }] });
    expect(projection.financeFundingAnalysis?.aggregateShortfall.amountMinor).toBeTruthy();
  });

  it("excludes confirmed cross-account movements from aggregate totals while retaining unresolved candidates", () => {
    const outgoing = record("checking-transfer", { kind: "finance-transaction", merchant: "transfer to savings", description: "Transfer to savings", amountMinor: "-2500", currency: "CAD", accountId: "checking", postedAt: "2026-01-02T00:00:00.000Z", status: "POSTED" }, { truthClass: "IMPORTED_RECORD" });
    const incoming = record("savings-transfer", { kind: "finance-transaction", merchant: "transfer from checking", description: "Transfer from checking", amountMinor: "2500", currency: "CAD", accountId: "savings", postedAt: "2026-01-03T00:00:00.000Z", status: "POSTED" }, { truthClass: "IMPORTED_RECORD" });
    const unmatched = record("unmatched-transfer", { kind: "finance-transaction", merchant: "transfer to brokerage", description: "Transfer to brokerage", amountMinor: "-500", currency: "CAD", accountId: "checking", postedAt: "2026-01-04T00:00:00.000Z", status: "POSTED" }, { truthClass: "IMPORTED_RECORD" });
    const projection = projectFinanceState([outgoing, incoming, unmatched]);
    expect(projection.transferAnalysis.matches).toHaveLength(1);
    expect(projection.transferAnalysis.unmatchedTransactionIds).toEqual([unmatched.id]);
    expect(projection.summary?.postedIncome.amountMinor).toBe("0");
    expect(projection.summary?.postedSpending.amountMinor).toBe("500");
    expect(projection.summary?.netCashFlow.amountMinor).toBe("-500");
  });
});
