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

  it("recomputes rolling essential-month goals from current imported evidence", () => {
    const essentialJanuary = record("essential-jan", { kind: "finance-transaction", merchant: "rent", description: "Rent", amountMinor: "-10000", currency: "CAD", accountId: "checking", postedAt: "2026-01-02T00:00:00.000Z", status: "POSTED", essential: true }, { truthClass: "IMPORTED_RECORD" });
    const essentialFebruary = record("essential-feb", { kind: "finance-transaction", merchant: "rent", description: "Rent", amountMinor: "-10000", currency: "CAD", accountId: "checking", postedAt: "2026-02-02T00:00:00.000Z", status: "POSTED", essential: true }, { truthClass: "IMPORTED_RECORD" });
    const goal = record("rolling-reserve", { kind: "finance-goal", label: "Emergency reserve", text: "Emergency reserve", targetKind: "ROLLING_ESSENTIAL_MONTHS", targetMonths: 6, currency: "CAD", targetDate: "2027-01-01" });
    const projection = projectFinanceState([essentialJanuary, essentialFebruary, goal]);
    expect(projection.financeGoalLimitations).toEqual([]);
    expect(projection.financeGoalPlans[0]?.plan).toMatchObject({ target: { amountMinor: "60000", currency: "CAD" }, remaining: { amountMinor: "60000", currency: "CAD" } });
  });

  it("projects a portfolio funding conflict once and exposes review-only alternatives", () => {
    const reserve = record("finance-goal-reserve", { kind: "finance-goal", label: "Emergency reserve", text: "Emergency reserve", targetAmountMinor: "120000", currency: "CAD", targetDate: "2027-01-01", sustainableMonthlySurplusMinor: "50000" });
    const travel = record("finance-goal-travel", { kind: "finance-goal", label: "Travel", text: "Travel", targetAmountMinor: "120000", currency: "CAD", targetDate: "2027-01-01", sustainableMonthlySurplusMinor: "50000" });
    const projection = projectFinanceState([reserve, travel]);
    expect(projection.financeFundingAnalysis).toMatchObject({ currency: "CAD", fundingConflict: true, hardConstraintConflict: false, alternatives: [{ id: "PROPORTIONAL_SOFT_GOALS" }, { id: "DEFER_SOFT_GOALS" }] });
    expect(projection.financeFundingAnalysis?.aggregateShortfall.amountMinor).toBeTruthy();
  });

  it("carries persisted hard constraints into portfolio alternatives without mutating goals", () => {
    const reserve = record("finance-goal-reserve", { kind: "finance-goal", label: "Emergency reserve", text: "Emergency reserve", targetAmountMinor: "40000000", currency: "CAD", targetDate: "2099-01-01", sustainableMonthlySurplusMinor: "50000", hardConstraint: true });
    const travel = record("finance-goal-travel", { kind: "finance-goal", label: "Travel", text: "Travel", targetAmountMinor: "20000000", currency: "CAD", targetDate: "2099-01-01", sustainableMonthlySurplusMinor: "50000" });
    const projection = projectFinanceState([reserve, travel]);
    expect(projection.financeGoalPlans.find((entry) => entry.recordId === reserve.id)?.hardConstraint).toBe(true);
    expect(projection.financeFundingAnalysis).toMatchObject({ fundingConflict: true, hardConstraintConflict: false, alternatives: [{ preservesHardConstraints: true }, { preservesHardConstraints: true }] });
    expect(reserve.data.hardConstraint).toBe(true);
  });

  it("projects retained investment valuations into explicit FIRE scenarios without mutating the adopted records", () => {
    const investmentFacts = record("investment-statement", {
      kind: "finance-statement-facts",
      sourceId: "investment-source-1",
      sourceClass: "INVESTMENT",
      statementFacts: {
        sourceId: "investment-source-1",
        sourceClass: "INVESTMENT",
        investment: { valuation: { amountMinor: "10000000", currency: "CAD" }, valuationDate: "2026-01-01T00:00:00.000Z", externalCashFlows: [] },
        evidence: { truthClass: "OBSERVED", sourceIds: ["investment-source-1"] },
        limitations: []
      }
    }, { truthClass: "IMPORTED_RECORD", provenance: { source: "IMPORT", capturedAt: "2026-01-01T00:00:00.000Z", sourceId: "investment-source-1" } });
    const scenario = {
      kind: "finance-fire", scenarioId: "fire-base", currency: "CAD", annualContributionMinor: "120000", annualSpendingMinor: "60000", retirementDate: "2031-01-01", yearsInRetirement: 10,
      nominalReturnRate: 0.05, inflationRate: 0.02, annualFeesRate: 0.01, effectiveTaxRate: 0.2, withdrawalRate: 0,
      downsideFirstReturns: [-0.2, -0.1, 0.02], upsideFirstReturns: [0.15, 0.1, 0.05]
    };
    const base = record("fire-base-record", scenario, { truthClass: "ASSUMPTION" });
    const comparison = record("fire-downside-record", { ...scenario, scenarioId: "fire-downside", nominalReturnRate: 0.03 }, { truthClass: "ASSUMPTION" });
    const projection = projectFinanceState([investmentFacts, base, comparison], { asOfDate: "2026-01-01" });
    expect(projection.fireScenarioLimitations).toEqual([]);
    expect(projection.statementFacts).toHaveLength(1);
    expect(projection.fireScenarios.map((entry) => entry.scenarioId)).toEqual(["fire-base", "fire-downside"]);
    expect(projection.fireScenarios[0]?.projection).toMatchObject({ retirementDate: "2031-01-01", currency: "CAD", truthClass: "MODELED" });
    expect(projection.fireScenarios[0]?.inputEvidence.currentInvestments).toMatchObject({ truthClass: "OBSERVED", sourceIds: ["investment-source-1"] });
    expect(base.data.annualContributionMinor).toBe("120000");
    expect(investmentFacts.data.statementFacts).toBeTruthy();
  });

  it("keeps incomplete FIRE scenarios explicit instead of coercing missing assumptions", () => {
    const incomplete = record("fire-incomplete", { kind: "finance-fire", scenarioId: "incomplete", currency: "CAD", annualSpendingMinor: "60000", yearsToRetirement: 5, yearsInRetirement: 10 });
    const projection = projectFinanceState([incomplete]);
    expect(projection.fireScenarios).toEqual([]);
    expect(projection.fireScenarioLimitations).toEqual(["fire-incomplete: current investment balance is missing; no statement valuation or finance-investment record is available"]);
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

  it("projects only explicitly authorized Travel and Work financial signals without changing their owners", () => {
    const travel = record("travel-plan-1", { kind: "travel-plan", label: "Vacation", itinerary: "private itinerary", financeProjection: { authorized: true, estimatedCostMinor: "120000", currency: "CAD", dueDate: "2026-12-15", label: "Vacation budget" } }, { owner: "domain.travel", truthClass: "USER_OBSERVATION" });
    const compensation = record("work-pay-1", { kind: "compensation-change", title: "Promotion", financeProjection: { authorized: true, monthlyAmountMinor: "500000", currency: "CAD", effectiveDate: "2026-10-01", label: "Monthly compensation" } }, { owner: "domain.work", truthClass: "IMPORTED_RECORD", provenance: { source: "IMPORT", capturedAt: "2026-09-19T00:00:00.000Z", sourceId: "pay-statement-1" } });
    const ignored = record("travel-plan-2", { kind: "travel-plan", label: "Private trip", estimatedCostMinor: "999999", currency: "CAD", dueDate: "2026-11-01" }, { owner: "domain.travel" });
    const projection = projectFinanceState([travel, compensation, ignored], { changedIds: [travel.id, compensation.id] });
    expect(projection.crossDomain.travelPlans).toMatchObject([{ sourceId: travel.id, estimatedCost: { amountMinor: "120000", currency: "CAD" }, dueDate: "2026-12-15" }]);
    expect(projection.crossDomain.compensationChanges).toMatchObject([{ sourceId: compensation.id, monthlyIncome: { amountMinor: "500000", currency: "CAD" }, effectiveDate: "2026-10-01", sourceIds: ["pay-statement-1"] }]);
    expect(projection.crossDomain.cashFlowByMonth).toEqual({ "2026-10:CAD": { amountMinor: "500000", currency: "CAD" }, "2026-12:CAD": { amountMinor: "-120000", currency: "CAD" } });
    expect(projection.crossDomain.sourceIds).toEqual(["pay-statement-1", travel.id]);
    expect(projection.crossDomain.limitations).toEqual([]);
    expect(travel.owner).toBe("domain.travel");
    expect(compensation.owner).toBe("domain.work");
    expect(projection.transactionCount).toBe(0);
  });

  it("reports incomplete authorized cross-domain projections without inventing amounts", () => {
    const travel = record("travel-plan-incomplete", { kind: "travel-plan", financeProjection: { authorized: true, currency: "CAD", dueDate: "not-a-date" } }, { owner: "domain.travel" });
    const projection = projectFinanceState([travel]);
    expect(projection.crossDomain.travelPlans).toEqual([]);
    expect(projection.crossDomain.cashFlowByMonth).toEqual({});
    expect(projection.crossDomain.limitations).toEqual(["travel-plan-incomplete: travel financial projection is incomplete"]);
  });

  it("creates an evidence-linked update brief and stays quiet without a material change set", () => {
    const income = record("brief-income", { kind: "finance-transaction", merchant: "payroll", description: "Payroll", amountMinor: "300000", currency: "CAD", accountId: "checking", postedAt: "2026-01-02T00:00:00.000Z", status: "POSTED" }, { truthClass: "IMPORTED_RECORD", provenance: { source: "IMPORT", capturedAt: "2026-01-03T00:00:00.000Z", sourceId: "brief-statement" } });
    const changed = projectFinanceState([income], { changedIds: [income.id] });
    expect(changed.updateBrief).toMatchObject({ materialChange: true, quiet: false, truthClass: "DERIVED", sourceIds: ["brief-statement"] });
    expect(changed.updateBrief.sections).toMatchObject({ currentPosition: 1, materialChanges: 1, cashFlowOutlook: 1 });
    const quiet = projectFinanceState([income]);
    expect(quiet.updateBrief).toMatchObject({ materialChange: false, quiet: true });
  });

  it("reuses one imported source across transaction, statement, cross-domain, and Home projections", () => {
    const sourceId = "finance-source:shared-monthly-batch";
    const transaction = record("shared-transaction", { kind: "finance-transaction", merchant: "payroll", description: "Payroll", amountMinor: "300000", currency: "CAD", accountId: "checking", postedAt: "2026-01-02T00:00:00.000Z", status: "POSTED", financeLineage: { sourceId, sourceSha256: "a".repeat(64), sourceRow: 2, parserProfile: "CSV_HEADER_V1", rawFields: {} } }, { truthClass: "IMPORTED_RECORD", provenance: { source: "IMPORT", capturedAt: "2026-01-03T00:00:00.000Z", sourceId: "shared-row" } });
    const facts = record("shared-statement-facts", { kind: "finance-statement-facts", sourceId, sourceClass: "CREDIT_CARD", statementFacts: { sourceId, sourceClass: "CREDIT_CARD", creditCard: { statementBalance: { amountMinor: "50000", currency: "CAD" } }, evidence: { truthClass: "OBSERVED", sourceIds: [sourceId] }, limitations: [] } }, { truthClass: "IMPORTED_RECORD", provenance: { source: "IMPORT", capturedAt: "2026-01-03T00:00:00.000Z", sourceId } });
    const travel = record("shared-travel", { kind: "travel-plan", label: "Trip", financeProjection: { authorized: true, estimatedCostMinor: "120000", currency: "CAD", dueDate: "2026-12-15" } }, { owner: "domain.travel", truthClass: "IMPORTED_RECORD", provenance: { source: "IMPORT", capturedAt: "2026-01-03T00:00:00.000Z", sourceId } });
    const projection = projectFinanceState([transaction, facts, travel], { changedIds: [transaction.id] });
    expect(projection.sourceIds).toEqual([sourceId]);
    expect(projection.statementFacts[0]?.evidence.sourceIds).toEqual([sourceId]);
    expect(projection.crossDomain.sourceIds).toEqual([sourceId]);
    expect(projection.updateBrief.sourceIds).toEqual([sourceId]);
  });
});
