import { describe, expect, it } from "vitest";
import { parseFinanceCsv, type FinanceStatementSource } from "./finance";
import { allocateFinanceResource, analyzeFinanceGraph, assessFinanceDataQuality, classifyFinanceSource, createFinanceForecast, detectFinanceParserDrift, detectFinanceReviewCases, evaluateFinanceFeedbackLoop, evaluateFinanceReviewCases, inferFinanceRecurringPatterns, matchFinanceTransfers, planFinanceAllocationAlternatives, projectFinanceGoal, projectFireScenario, propagateFinanceGraph, summarizeFinanceTransactions, type FinanceDependencyGraph } from "./finance-model";

const source: FinanceStatementSource = { sourceId: "source:model", name: "model.csv", sha256: "c".repeat(64), accountId: "checking", currency: "CAD" };

describe("shared Finance/Synergy model", () => {
  it("quarantines ordinary dependency cycles and preserves downstream invalidation", () => {
    const graph: FinanceDependencyGraph = {
      nodes: ["income", "surplus", "goal"].map((id) => ({ id, label: id, evidence: { truthClass: "OBSERVED", sourceIds: ["fixture"] } })),
      edges: [
        { id: "income-surplus", from: "income", to: "surplus", kind: "DEPENDENCY", evidence: { truthClass: "MODELED", sourceIds: ["fixture"] } },
        { id: "surplus-goal", from: "surplus", to: "goal", kind: "DEPENDENCY", evidence: { truthClass: "MODELED", sourceIds: ["fixture"] } },
        { id: "goal-income", from: "goal", to: "income", kind: "DEPENDENCY", evidence: { truthClass: "MODELED", sourceIds: ["fixture"] } }
      ]
    };
    const analysis = analyzeFinanceGraph(graph);
    expect(analysis.cycleNodeIds).toEqual(["goal", "income", "surplus"]);
    const result = propagateFinanceGraph(graph, { income: 100, surplus: 80, goal: 50 }, { derive: (_id, inputs) => inputs.reduce((sum, value) => sum + value, 0) });
    expect(result.invalidatedNodeIds).toEqual(["goal", "income", "surplus"]);
    expect(result.values).toEqual({ income: 100, surplus: 80, goal: 50 });
  });

  it("keeps scenario edges out of baseline and evaluates a feedback loop only in a bounded model", () => {
    const graph: FinanceDependencyGraph = {
      nodes: ["surplus", "travel"].map((id) => ({ id, label: id, evidence: { truthClass: "OBSERVED", sourceIds: ["fixture"] } })),
      edges: [{ id: "scenario-edge", from: "surplus", to: "travel", kind: "DEPENDENCY", scenarioId: "vacation-cut", evidence: { truthClass: "MODELED", sourceIds: ["fixture"] } }]
    };
    expect(analyzeFinanceGraph(graph).ignoredScenarioEdgeIds).toEqual(["scenario-edge"]);
    const baseline = propagateFinanceGraph(graph, { surplus: 500, travel: 0 }, { derive: (_id, inputs) => inputs[0] });
    const scenario = propagateFinanceGraph(graph, { surplus: 500, travel: 0 }, { scenarioId: "vacation-cut", derive: (_id, inputs) => (inputs[0] ?? 0) - 100 });
    expect(baseline.values.travel).toBe(0);
    expect(scenario.values.travel).toBe(400);
    const converged = evaluateFinanceFeedbackLoop({ reserve: 0 }, (values) => ({ reserve: (values.reserve ?? 0) * 0.5 + 50 }), { scenarioId: "reserve-model", maxIterations: 100, tolerance: 0.01 });
    expect(converged.status).toBe("CONVERGED");
    const bounded = evaluateFinanceFeedbackLoop({ reserve: 0 }, (values) => ({ reserve: (values.reserve ?? 0) + 1 }), { scenarioId: "non-convergent", maxIterations: 3 });
    expect(bounded.status).toBe("NON_CONVERGED");
  });

  it("prevents shared-resource double counting and reports goal shortfalls", () => {
    const result = allocateFinanceResource({ amountMinor: "10000", currency: "CAD" }, [
      { id: "emergency", resourceId: "resource", goalId: "emergency", amount: { amountMinor: "7000", currency: "CAD" }, mode: "EXCLUSIVE", evidence: { truthClass: "TARGET", sourceIds: ["user"] } },
      { id: "home", resourceId: "resource", goalId: "home", amount: { amountMinor: "5000", currency: "CAD" }, mode: "EXCLUSIVE", evidence: { truthClass: "TARGET", sourceIds: ["user"] } },
      { id: "retirement-enabler", resourceId: "resource", goalId: "retirement", amount: { amountMinor: "10000", currency: "CAD" }, mode: "ENABLING", evidence: { truthClass: "MODELED", sourceIds: ["model"] } }
    ], { emergency: { amountMinor: "8000", currency: "CAD" }, home: { amountMinor: "5000", currency: "CAD" } });
    expect(result.exclusiveAllocated.amountMinor).toBe("12000");
    expect(result.unallocated.amountMinor).toBe("0");
    expect(result.overAllocated.amountMinor).toBe("2000");
    expect(result.conflictIds).toEqual(["RESOURCE_OVER_ALLOCATED"]);
    expect(result.unmetByGoal.emergency?.amountMinor).toBe("1000");
  });

  it("projects dynamic goals, descriptive cash flow, and explicit FIRE sequence sensitivity", () => {
    const transactions = parseFinanceCsv("Date,Description,Amount,Status\n2026-01-02,Payroll,3000,POSTED\n2026-01-03,Rent,-1000,POSTED\n2026-01-04,Pending card,-200,PENDING\n2026-01-05,Account fee,-10,POSTED\n", source);
    const summary = summarizeFinanceTransactions(transactions, "CAD");
    expect(summary.postedIncome.amountMinor).toBe("300000");
    expect(summary.postedSpending.amountMinor).toBe("101000");
    expect(summary.pendingNet.amountMinor).toBe("-20000");
    expect(summary.feeSpending.amountMinor).toBe("1000");
    const goal = projectFinanceGoal({ goalId: "reserve", target: { kind: "ROLLING_ESSENTIAL_MONTHS", months: 6, monthlyEssentialSpending: { amountMinor: "100000", currency: "CAD" } }, funded: { amountMinor: "200000", currency: "CAD" }, targetDate: "2026-12-01", sustainableMonthlySurplus: { amountMinor: "50000", currency: "CAD" } }, new Date("2026-01-01T00:00:00.000Z"));
    expect(goal.target.amountMinor).toBe("600000");
    expect(goal.requiredMonthlyContribution?.amountMinor).toBe("36364");
    expect(goal.fundingConflict).toBe(false);
    const fire = projectFireScenario({ scenarioId: "fire-base", currency: "CAD", currentInvestments: { amountMinor: "10000000", currency: "CAD" }, annualContribution: { amountMinor: "120000", currency: "CAD" }, annualSpending: { amountMinor: "60000", currency: "CAD" }, yearsToRetirement: 5, yearsInRetirement: 10, nominalReturnRate: 0.05, inflationRate: 0.02, annualFeesRate: 0.01, effectiveTaxRate: 0.2, withdrawalRate: 0, downsideFirstReturns: [-0.2, -0.1, 0.02], upsideFirstReturns: [0.15, 0.1, 0.05] });
    expect(fire.truthClass).toBe("MODELED");
    expect(fire.downsideSequenceEnd).toBeLessThan(fire.upsideSequenceEnd);
    expect(fire.limitations.length).toBeGreaterThan(0);
  });

  it("matches only exact evidenced cross-account transfers and leaves unmatched movements visible", () => {
    const checking = parseFinanceCsv("Date,Description,Amount,Id\n2026-01-02,Payment to credit card,-100.00,checking-card\n2026-01-03,Transfer to savings,-25.00,checking-savings\n2026-01-04,Transfer to brokerage,-5.00,unmatched\n", source);
    const creditCard = parseFinanceCsv("Date,Description,Amount,Id\n2026-01-02,Credit card payment,100.00,card-checking\n", { ...source, sourceId: "source:card", accountId: "credit-card", sha256: "d".repeat(64) });
    const savings = parseFinanceCsv("Date,Description,Amount,Id\n2026-01-03,Transfer from checking,25.00,savings-checking\n", { ...source, sourceId: "source:savings", accountId: "savings", sha256: "e".repeat(64) });
    const transactions = [...checking, ...creditCard, ...savings];
    const analysis = matchFinanceTransfers(transactions);
    expect(analysis.matches).toHaveLength(2);
    expect(analysis.matches.map((match) => match.kind).sort()).toEqual(["CARD_PAYMENT", "INTERNAL_TRANSFER"]);
    expect(analysis.unmatchedTransactionIds).toEqual([checking[2]?.id]);
    const summary = summarizeFinanceTransactions(transactions, "CAD", { excludedTransferIds: analysis.matches.flatMap((match) => [match.outgoingTransactionId, match.incomingTransactionId]) });
    expect(summary.postedIncome.amountMinor).toBe("0");
    expect(summary.postedSpending.amountMinor).toBe("500");
    expect(summary.netCashFlow.amountMinor).toBe("-500");
    expect(summary.transferNet.amountMinor).toBe("0");
  });

  it("returns deterministic review-only alternatives for conflicting soft goals", () => {
    const analysis = planFinanceAllocationAlternatives([
      { goalId: "travel", requiredMonthlyContribution: { amountMinor: "50000", currency: "CAD" } },
      { goalId: "reserve", requiredMonthlyContribution: { amountMinor: "80000", currency: "CAD" }, hardConstraint: true },
      { goalId: "learning", requiredMonthlyContribution: { amountMinor: "20000", currency: "CAD" } }
    ], { amountMinor: "100000", currency: "CAD" });
    expect(analysis).toMatchObject({ currency: "CAD", requestedMonthlyContribution: { amountMinor: "150000", currency: "CAD" }, sustainableMonthlySurplus: { amountMinor: "100000", currency: "CAD" }, fundingConflict: true, hardConstraintConflict: false });
    expect(analysis.alternatives.map((alternative) => alternative.id)).toEqual(["PROPORTIONAL_SOFT_GOALS", "DEFER_SOFT_GOALS"]);
    expect(analysis.alternatives[0]).toMatchObject({ monthlyContributions: { learning: { amountMinor: "5715" }, reserve: { amountMinor: "80000" }, travel: { amountMinor: "14285" } }, totalMonthlyContribution: { amountMinor: "100000" }, shortfallByGoal: { learning: { amountMinor: "14285" }, travel: { amountMinor: "35715" } }, preservesHardConstraints: true, truthClass: "MODELED" });
    expect(analysis.alternatives[1]).toMatchObject({ monthlyContributions: { learning: { amountMinor: "0" }, reserve: { amountMinor: "80000" }, travel: { amountMinor: "0" } }, totalMonthlyContribution: { amountMinor: "80000" }, preservesHardConstraints: true });
  });

  it("rejects duplicate or currency-incompatible funding requests and exposes hard conflicts without fake alternatives", () => {
    expect(() => planFinanceAllocationAlternatives([
      { goalId: " reserve ", requiredMonthlyContribution: { amountMinor: "100", currency: "CAD" } },
      { goalId: "reserve", requiredMonthlyContribution: { amountMinor: "100", currency: "CAD" } }
    ], { amountMinor: "1000", currency: "CAD" })).toThrow("unique and non-empty");
    expect(() => planFinanceAllocationAlternatives([{ goalId: "usd", requiredMonthlyContribution: { amountMinor: "100", currency: "USD" } }], { amountMinor: "1000", currency: "CAD" })).toThrow("surplus currency");
    const hardConflict = planFinanceAllocationAlternatives([{ goalId: "reserve", requiredMonthlyContribution: { amountMinor: "1200", currency: "CAD" }, hardConstraint: true }, { goalId: "travel", requiredMonthlyContribution: { amountMinor: "100", currency: "CAD" } }], { amountMinor: "1000", currency: "CAD" });
    expect(hardConflict).toMatchObject({ fundingConflict: true, hardConstraintConflict: true, alternatives: [] });
  });

  it("keeps source-class/parser drift, recurrence, anomaly, forecast, and quality state explicit", () => {
    expect(classifyFinanceSource("March credit card statement.csv", ["Date", "Description", "Amount"]).sourceClass).toBe("CREDIT_CARD");
    expect(classifyFinanceSource("credit-card-statement.csv", ["StatementBalance", "DueDate", "MinimumDue"]).sourceClass).toBe("CREDIT_CARD");
    const profile = { id: "profile-1", sourceClass: "TRANSACTION_ACCOUNT" as const, requiredHeaders: ["date", "description", "amount"], headerFingerprint: "amount|date|description", signConvention: "SIGNED_AMOUNT" as const };
    expect(detectFinanceParserDrift(profile, ["Date", "Description", "Amount"]).status).toBe("STABLE");
    expect(detectFinanceParserDrift(profile, ["Date", "Description", "Debit", "Credit"]).status).toBe("DRIFT");
    const recurringTransactions = parseFinanceCsv("Date,Description,Amount\n2026-01-01,Rent,-1000\n2026-02-01,Rent,-1000\n2026-03-01,Rent,-1000\n2026-03-02,New Merchant,-500\n", source);
    const patterns = inferFinanceRecurringPatterns(recurringTransactions);
    expect(patterns).toHaveLength(1);
    expect(patterns[0]).toMatchObject({ cadence: "MONTHLY", occurrenceCount: 3, merchant: "rent" });
    expect(detectFinanceReviewCases(recurringTransactions).some((review) => review.transactionId === recurringTransactions[3]?.id && review.disposition === "UNRESOLVED")).toBe(true);
    const vintage = createFinanceForecast({ vintageId: "vintage-1", createdAt: "2026-01-01T00:00:00.000Z", startMonth: "2026-04", openingCash: { amountMinor: "100000", currency: "CAD" }, monthlyIncome: { amountMinor: "300000", currency: "CAD" }, monthlySpending: { amountMinor: "200000", currency: "CAD" }, horizonMonths: 3, scenario: "BASE", sourceIds: ["source:model"] });
    expect(vintage.points.map((point) => point.month)).toEqual(["2026-04", "2026-05", "2026-06"]);
    expect(vintage.points[2]?.closingCash.amountMinor).toBe("400000");
    const quality = assessFinanceDataQuality({ requiredPeriods: ["2026-01", "2026-02"], availablePeriods: ["2026-01"], unresolvedReviewCases: 1 });
    expect(quality.status).toBe("UNKNOWN");
    expect(quality.limitations).toEqual(["missing periods: 2026-02", "1 unresolved review case(s)"]);
  });

  it("keeps authenticated or familiar payments distinct from legitimacy and scopes dispositions", () => {
    const transactions = parseFinanceCsv("Date,Description,Amount,Id\n2026-01-01,Known Merchant,-10.00,known\n2026-01-02,Unknown Beneficiary,-500.00,suspicious\n2026-01-03,Known Merchant,-11.00,known-2\n", source);
    const evaluation = evaluateFinanceReviewCases(transactions, {
      [transactions[0]!.id]: { authenticated: true, userInitiated: true, familiarMerchant: true, benignExplanation: "planned household purchase", evidence: ["receipt-1"] },
      [transactions[1]!.id]: { authenticated: true, userInitiated: true, possibleScamOrCoercion: true, evidence: ["conversation-1"] }
    }, [{ transactionId: transactions[0]!.id, disposition: "CONFIRMED_LEGITIMATE", scope: { accountId: "checking", merchant: "known merchant" }, reason: "Receipt and household context confirmed this payment", resolvedAt: "2026-01-04T00:00:00.000Z", sourceIds: ["receipt-1"] }], [transactions[1]!.id, "missing-known-issue"]);
    expect(evaluation.cases.find((review) => review.transactionId === transactions[1]!.id)).toMatchObject({ priority: "URGENT_REVIEW", disposition: "UNRESOLVED" });
    expect(evaluation.cases.find((review) => review.transactionId === transactions[0]!.id)).toMatchObject({ disposition: "CONFIRMED_LEGITIMATE" });
    expect(evaluation.metrics.confirmedLegitimateCount).toBe(1);
    expect(evaluation.metrics.observableMissedKnownIssueCount).toBe(1);
    expect(evaluation.limitations.join(" ")).toContain("metrics remain limited");
    expect(evaluation.cases.find((review) => review.transactionId === transactions[1]!.id)?.reasons.join(" ")).toContain("not proof of informed legitimacy");
  });
});
