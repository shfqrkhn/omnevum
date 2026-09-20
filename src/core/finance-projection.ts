import { projectAuthorizedDependencyImpact, projectDependencyGraph, type DependencyGraph, type DependencyImpact } from "./dependency-graph";
import { addMoney, parseMoney, type MoneyValue } from "./money";
import type { CanonicalRecord, TruthClass } from "./model";
import type { FinanceLineage, FinanceSourceClass, FinanceStatementFacts, FinanceTransaction, FinanceTransactionStatus } from "./finance";
import { allocateFinanceResource, analyzeFinanceRecurrence, assessFinanceDataQuality, analyzeFinanceGraph, calculateFinanceRollingEssentialSpending, detectFinanceReviewCases, matchFinanceTransfers, planFinanceAllocationAlternatives, projectFinanceGoal, projectFireScenario, reconcileFinanceForecast, summarizeFinanceTransactions, type FinanceAllocationResult, type FinanceDataQuality, type FinanceDependencyGraph, type FinanceFactClass, type FinanceForecastActual, type FinanceForecastReconciliation, type FinanceForecastVintage, type FinanceFundingAnalysis, type FinanceGoalPlan, type FinanceGoalTarget, type FinanceGraphAnalysis, type FinanceRecurringPattern, type FinanceRecurringSignal, type FinanceReviewCase, type FinanceTransactionSummary, type FinanceTransferAnalysis, type FireScenarioInput, type FireScenarioProjection } from "./finance-model";

/**
 * Read-only Finance projection over canonical records and the shared typed
 * relationship graph. It deliberately owns no durable state: imported rows,
 * captured expenses, goals, and links remain owned by their normal commands.
 */
export interface FinanceProjectionOptions {
  currency?: string;
  asOfDate?: string;
  requiredPeriods?: readonly string[];
  requiredSourceIds?: readonly string[];
  requiredSourceClasses?: readonly FinanceSourceClass[];
  changedIds?: readonly string[];
  forecastVintages?: readonly FinanceForecastVintage[];
  forecastActuals?: readonly FinanceForecastActual[];
}

export interface FinanceTravelPlanProjection {
  sourceId: string;
  label: string;
  estimatedCost: MoneyValue;
  dueDate: string;
  truthClass: FinanceFactClass;
  sourceIds: string[];
}

export interface FinanceCompensationProjection {
  sourceId: string;
  label: string;
  monthlyIncome: MoneyValue;
  effectiveDate: string;
  truthClass: FinanceFactClass;
  sourceIds: string[];
}

export interface FinanceCrossDomainProjection {
  travelPlans: FinanceTravelPlanProjection[];
  compensationChanges: FinanceCompensationProjection[];
  cashFlowByMonth: Record<string, MoneyValue>;
  affectedFinanceIds: string[];
  sourceIds: string[];
  limitations: string[];
}

export interface FinanceFireScenarioProjection {
  recordId: string;
  scenarioId: string;
  projection: FireScenarioProjection;
  inputEvidence: Record<string, { truthClass: FinanceFactClass; sourceIds: string[]; note?: string }>;
  sourceIds: string[];
}

export interface FinanceUpdateBrief {
  sourceIds: string[];
  materialChange: boolean;
  quiet: boolean;
  sections: {
    currentPosition: number;
    materialChanges: number;
    cashFlowOutlook: number;
    goals: number;
    reviewItems: number;
    recurringPatterns: number;
    recurringSignals: number;
    forecastVintages: number;
    forecastActualizations: number;
    dataQualityLimitations: number;
  };
  limitations: string[];
  truthClass: "DERIVED";
}

export interface FinanceProjection {
  status: "NO_DATA" | "LIMITED" | "READY";
  currency?: string;
  transactionCount: number;
  accountIds: string[];
  sourceIds: string[];
  summariesByCurrency: Record<string, FinanceTransactionSummary>;
  summary?: FinanceTransactionSummary;
  transferAnalysis: FinanceTransferAnalysis;
  recurringPatterns: FinanceRecurringPattern[];
  recurringSignals: FinanceRecurringSignal[];
  reviewCases: FinanceReviewCase[];
  quality: FinanceDataQuality;
  dependencyGraph: DependencyGraph;
  dependencyImpact: DependencyImpact;
  financeGraph: FinanceDependencyGraph;
  financeGraphAnalysis: FinanceGraphAnalysis;
  financeAllocationResults: Array<{ resourceId: string; result: FinanceAllocationResult }>;
  financeGoalPlans: Array<{ recordId: string; plan: FinanceGoalPlan; hardConstraint: boolean }>;
  financeGoalLimitations: string[];
  financeFundingAnalysis?: FinanceFundingAnalysis;
  statementFacts: FinanceStatementFacts[];
  fireScenarios: FinanceFireScenarioProjection[];
  fireScenarioLimitations: string[];
  updateBrief: FinanceUpdateBrief;
  crossDomain: FinanceCrossDomainProjection;
  invalidatedFinanceIds: string[];
  forecastVintages: FinanceForecastVintage[];
  forecastReconciliations: FinanceForecastReconciliation[];
}

const FINANCE_NODE_KINDS = new Set([
  "finance-transaction",
  "expense",
  "finance-account",
  "finance-resource",
  "finance-allocation",
  "finance-goal",
  "finance-income",
  "finance-investment",
  "finance-debt",
  "finance-insurance",
  "finance-forecast",
  "finance-fire",
  "finance-statement-facts",
  "goal"
]);

const FINANCE_STATUSES = new Set<FinanceTransactionStatus>(["PENDING", "POSTED", "REVERSED", "REFUNDED", "VOIDED", "CORRECTED", "UNKNOWN"]);

export function projectFinanceState(records: readonly CanonicalRecord[], options: FinanceProjectionOptions = {}): FinanceProjection {
  const activeRecords = records.filter((record) => !record.deleted);
  const transactions = activeRecords.map(toFinanceTransaction).filter((transaction): transaction is FinanceTransaction => transaction !== undefined);
  const byCurrency = new Map<string, FinanceTransaction[]>();
  for (const transaction of transactions) byCurrency.set(transaction.amount.currency, [...(byCurrency.get(transaction.amount.currency) ?? []), transaction]);
  const transferAnalysis = matchFinanceTransfers(transactions);
  const excludedTransferIds = transferAnalysis.matches.flatMap((match) => [match.outgoingTransactionId, match.incomingTransactionId]);
  const summariesByCurrency: Record<string, FinanceTransactionSummary> = {};
  for (const currency of [...byCurrency.keys()].sort()) summariesByCurrency[currency] = summarizeFinanceTransactions(byCurrency.get(currency) ?? [], currency, { excludedTransferIds });
  const currency = resolveCurrency(options.currency, [...byCurrency.keys()]);
  const summary = currency ? summariesByCurrency[currency] : undefined;
  const selectedTransactions = currency ? byCurrency.get(currency) ?? [] : transactions;
  const recurrence = analyzeFinanceRecurrence(selectedTransactions, options.asOfDate ? { asOfDate: options.asOfDate } : {});
  const recurringPatterns = recurrence.patterns;
  const recurringSignals = recurrence.signals;
  const reviewCases = detectFinanceReviewCases(selectedTransactions);
  const availablePeriods = [...new Set(selectedTransactions.map((transaction) => transaction.postedAt.slice(0, 7)))].sort();
  const statementFacts = activeRecords.map(toFinanceStatementFacts).filter((facts): facts is FinanceStatementFacts => facts !== undefined).sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  const qualityInput = {
    requiredPeriods: [...(options.requiredPeriods ?? [])],
    availablePeriods,
    availableSourceIds: [...new Set([...transactions.map((transaction) => transaction.lineage.sourceId), ...statementFacts.map((facts) => facts.sourceId)])],
    availableSourceClasses: [...new Set(statementFacts.map((facts) => facts.sourceClass))],
    unresolvedReconciliations: transferAnalysis.unresolvedMatches.length,
    unresolvedReviewCases: reviewCases.filter((review) => review.disposition === "UNRESOLVED").length
  };
  const quality = assessFinanceDataQuality({ ...qualityInput, ...(options.requiredSourceIds ? { requiredSourceIds: options.requiredSourceIds } : {}), ...(options.requiredSourceClasses ? { requiredSourceClasses: options.requiredSourceClasses } : {}) });
  const dependencyGraph = projectDependencyGraph([...activeRecords]);
  const dependencyImpact = projectAuthorizedDependencyImpact(activeRecords, [...(options.changedIds ?? [])]);
  const financeNodeIds = new Set(activeRecords.filter(isFinanceNode).map((record) => record.id));
  const crossDomain = projectCrossDomainFinance(activeRecords, dependencyImpact, financeNodeIds);
  const financeGraph: FinanceDependencyGraph = {
    nodes: activeRecords.filter((record) => financeNodeIds.has(record.id)).map((record) => ({ id: record.id, label: financeNodeLabel(record), evidence: { truthClass: financeFactClass(record.truthClass), sourceIds: sourceIdsForRecord(record), note: "Read-only Finance projection over the canonical record." } })).sort((left, right) => left.id.localeCompare(right.id)),
    edges: dependencyGraph.edges.filter((edge) => financeNodeIds.has(edge.sourceId) && financeNodeIds.has(edge.targetId)).map((edge) => ({ id: edge.id, from: edge.sourceId, to: edge.targetId, kind: edge.edgeKind, ...(edge.scenarioId ? { scenarioId: edge.scenarioId } : {}), ...(edge.allocationMode ? { allocationMode: edge.allocationMode } : {}), ...(edge.allocation ? { allocation: edge.allocation } : {}), evidence: { truthClass: financeFactClass(edge.evidence?.truthClass ?? "DERIVED"), sourceIds: edge.evidence?.sourceIds ?? [edge.id], note: "Typed relationship is projected without granting permission or creating a second owner." } })).sort((left, right) => left.id.localeCompare(right.id))
  };
  const financeGraphAnalysis = analyzeFinanceGraph(financeGraph);
  const financeAllocationResults = activeRecords.filter((record) => record.data.kind === "finance-resource").flatMap((resource) => {
    const money = recordMoney(resource);
    if (!money || BigInt(money.amountMinor) < 0n) return [];
    const allocations = financeGraph.edges.filter((edge) => edge.from === resource.id && edge.kind === "ALLOCATION" && edge.allocation).map((edge) => ({ id: edge.id, resourceId: resource.id, goalId: edge.to, amount: edge.allocation!, mode: edge.allocationMode ?? "EXCLUSIVE", evidence: edge.evidence }));
    return [{ resourceId: resource.id, result: allocateFinanceResource(money, allocations, {}, resource.id) }];
  });
  const fundedByGoal = new Map<string, MoneyValue>();
  for (const allocation of financeAllocationResults) {
    for (const [goalId, amount] of Object.entries(allocation.result.byGoal)) {
      const current = fundedByGoal.get(goalId);
      if (!current) fundedByGoal.set(goalId, amount);
      else if (current.currency === amount.currency) fundedByGoal.set(goalId, addMoney(current, amount));
    }
  }
  const excludedTransferIdSet = new Set(excludedTransferIds);
  const essentialTransactions = transactions.filter((transaction) => !excludedTransferIdSet.has(transaction.id));
  const financeGoalLimitations: string[] = [];
  const financeGoalPlans = activeRecords.filter((record) => record.data.kind === "finance-goal").flatMap((goal) => {
    const fixedTarget = recordMoneyField(goal, "targetAmountMinor");
    let target: FinanceGoalTarget | undefined = fixedTarget;
    if (!target && goal.data.targetKind === "ROLLING_ESSENTIAL_MONTHS") {
      const months = typeof goal.data.targetMonths === "number" ? goal.data.targetMonths : typeof goal.data.targetMonths === "string" ? Number(goal.data.targetMonths) : Number.NaN;
      const currencyValue = typeof goal.data.currency === "string" ? goal.data.currency : "";
      let normalizedCurrency: string | undefined;
      try { normalizedCurrency = parseMoney("0", currencyValue).currency; } catch { normalizedCurrency = undefined; }
      const rollingEssential = normalizedCurrency && Number.isInteger(months) && months >= 1 && months <= 120 ? calculateFinanceRollingEssentialSpending(essentialTransactions, normalizedCurrency, months) : undefined;
      const monthlyEssentialSpending = rollingEssential?.monthlyEssentialSpending;
      if (!Number.isInteger(months) || months < 1 || months > 120) financeGoalLimitations.push(`${goal.id}: rolling essential months is outside the supported range`);
      else if (!monthlyEssentialSpending) financeGoalLimitations.push(`${goal.id}: no posted essential-spending evidence is available for the rolling target`);
      else target = { kind: "ROLLING_ESSENTIAL_MONTHS", months, monthlyEssentialSpending };
    }
    if (!target) {
      if (goal.data.targetKind === "ROLLING_ESSENTIAL_MONTHS") return [];
      financeGoalLimitations.push(`${goal.id}: fixed target amount is missing`);
      return [];
    }
    const funded = fundedByGoal.get(goal.id);
    const sustainable = recordMoneyField(goal, "sustainableMonthlySurplusMinor");
    const targetDate = typeof goal.data.targetDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(goal.data.targetDate) ? goal.data.targetDate : undefined;
    const targetCurrency = "kind" in target ? target.monthlyEssentialSpending.currency : target.currency;
    if (funded && funded.currency !== targetCurrency) return [];
    if (sustainable && sustainable.currency !== targetCurrency) return [];
    try {
      return [{ recordId: goal.id, plan: projectFinanceGoal({ goalId: goal.id, target, funded: funded ?? parseMoney("0", targetCurrency), ...(targetDate ? { targetDate } : {}), ...(sustainable ? { sustainableMonthlySurplus: sustainable } : {}) }), hardConstraint: goal.data.hardConstraint === true }];
    } catch {
      return [];
    }
  });
  const fundingCandidates = financeGoalPlans.filter((entry): entry is { recordId: string; plan: FinanceGoalPlan & { requiredMonthlyContribution: MoneyValue; sustainableMonthlySurplus: MoneyValue }; hardConstraint: boolean } => Boolean(entry.plan.requiredMonthlyContribution && entry.plan.sustainableMonthlySurplus));
  const commonSurplus = fundingCandidates[0]?.plan.sustainableMonthlySurplus;
  const financeFundingAnalysis = commonSurplus && fundingCandidates.every((entry) => entry.plan.sustainableMonthlySurplus.currency === commonSurplus.currency && entry.plan.sustainableMonthlySurplus.amountMinor === commonSurplus.amountMinor)
    ? (() => {
        try {
          return planFinanceAllocationAlternatives(fundingCandidates.map((entry) => ({ goalId: entry.recordId, requiredMonthlyContribution: entry.plan.requiredMonthlyContribution, hardConstraint: entry.hardConstraint })), commonSurplus);
        } catch {
          return undefined;
        }
      })()
    : undefined;
  const investmentBalances = new Map<string, { value: MoneyValue; sourceIds: string[] }>();
  for (const facts of statementFacts) {
    const valuation = facts.sourceClass === "INVESTMENT" ? facts.investment?.valuation : undefined;
    if (!valuation) continue;
    const key = `${facts.sourceId}:${valuation.currency}`;
    investmentBalances.set(key, { value: valuation, sourceIds: [facts.sourceId] });
  }
  for (const record of activeRecords.filter((candidate) => candidate.data.kind === "finance-investment")) {
    const value = recordMoneyFieldAliases(record, ["valuationMinor", "marketValueMinor", "amountMinor"]);
    if (!value) continue;
    const sourceId = record.provenance.sourceId ?? record.id;
    const key = `${sourceId}:${value.currency}`;
    if (!investmentBalances.has(key)) investmentBalances.set(key, { value, sourceIds: [sourceId] });
  }
  const fireScenarioLimitations: string[] = [];
  const fireScenarios = activeRecords.filter((record) => record.data.kind === "finance-fire").flatMap((record): FinanceFireScenarioProjection[] => {
    const resolved = resolveFinanceFireScenario(record, [...investmentBalances.values()], options.asOfDate);
    if (!resolved.input) {
      fireScenarioLimitations.push(`${record.id}: ${resolved.limitation}`);
      return [];
    }
    try {
      const projection = projectFireScenario(resolved.input);
      return [{ recordId: record.id, scenarioId: projection.scenarioId, projection, inputEvidence: resolved.inputEvidence, sourceIds: resolved.sourceIds }];
    } catch (error) {
      fireScenarioLimitations.push(`${record.id}: ${error instanceof Error ? error.message : "FIRE scenario is invalid"}`);
      return [];
    }
  }).sort((left, right) => left.recordId.localeCompare(right.recordId));
  const forecastReconciliations = (options.forecastActuals && options.forecastActuals.length > 0 ? (options.forecastVintages ?? []) : []).map((vintage) => reconcileFinanceForecast(vintage, options.forecastActuals ?? [])).sort((left, right) => left.vintageId.localeCompare(right.vintageId));
  const updateBrief: FinanceUpdateBrief = {
    sourceIds: [...new Set([...transactions.map((transaction) => transaction.lineage.sourceId), ...statementFacts.map((facts) => facts.sourceId), ...crossDomain.sourceIds])].sort(),
    materialChange: (options.changedIds?.length ?? 0) > 0,
    quiet: (options.changedIds?.length ?? 0) === 0,
    sections: {
      currentPosition: summary ? 1 : statementFacts.length,
      materialChanges: options.changedIds?.length ?? 0,
      cashFlowOutlook: Object.keys(crossDomain.cashFlowByMonth).length + (summary ? 1 : 0),
      goals: financeGoalPlans.length,
      reviewItems: reviewCases.length,
      recurringPatterns: recurringPatterns.length,
      recurringSignals: recurringSignals.length,
      forecastVintages: options.forecastVintages?.length ?? 0,
      forecastActualizations: forecastReconciliations.reduce((count, reconciliation) => count + reconciliation.errors.length, 0),
      dataQualityLimitations: quality.limitations.length + crossDomain.limitations.length + financeGoalLimitations.length + fireScenarioLimitations.length + forecastReconciliations.flatMap((reconciliation) => reconciliation.limitations).length
    },
    limitations: [...new Set([...quality.limitations, ...crossDomain.limitations, ...financeGoalLimitations, ...fireScenarioLimitations, ...forecastReconciliations.flatMap((reconciliation) => reconciliation.limitations)])].sort(),
    truthClass: "DERIVED"
  };
  const invalidatedFinanceIds = dependencyImpact.invalidatedDerivedIds.filter((id) => financeNodeIds.has(id)).sort();
  const status = transactions.length === 0 ? "NO_DATA" : quality.status === "SUFFICIENT" && reviewCases.length === 0 ? "READY" : "LIMITED";
  return {
    status,
    ...(currency ? { currency } : {}),
    transactionCount: transactions.length,
    accountIds: [...new Set(transactions.map((transaction) => transaction.accountId))].sort(),
    sourceIds: [...new Set(transactions.map((transaction) => transaction.lineage.sourceId))].sort(),
    summariesByCurrency,
    ...(summary ? { summary } : {}),
    transferAnalysis,
    recurringPatterns,
    recurringSignals,
    reviewCases,
    quality: transactions.length === 0 ? { ...quality, status: "UNKNOWN", limitations: ["no Finance transactions are available for this projection"] } : quality,
    dependencyGraph,
    dependencyImpact,
    financeGraph,
    financeGraphAnalysis,
    financeAllocationResults,
    financeGoalPlans,
    financeGoalLimitations: [...new Set(financeGoalLimitations)].sort(),
    ...(financeFundingAnalysis ? { financeFundingAnalysis } : {}),
    statementFacts,
    fireScenarios,
    fireScenarioLimitations: [...new Set(fireScenarioLimitations)].sort(),
    updateBrief,
    crossDomain,
    invalidatedFinanceIds,
    forecastVintages: [...(options.forecastVintages ?? [])],
    forecastReconciliations
  };
}

function toFinanceStatementFacts(record: CanonicalRecord): FinanceStatementFacts | undefined {
  if (record.deleted || record.owner !== "domain.finance" || record.data.kind !== "finance-statement-facts") return undefined;
  const value = record.data.statementFacts;
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = value as Record<string, unknown>;
  const sourceId = typeof candidate.sourceId === "string" && candidate.sourceId.trim() ? candidate.sourceId : undefined;
  const sourceClass = candidate.sourceClass === "CREDIT_CARD" || candidate.sourceClass === "INVESTMENT" || candidate.sourceClass === "INSURANCE" ? candidate.sourceClass : undefined;
  if (!sourceId || !sourceClass) return undefined;
  const evidenceValue = typeof candidate.evidence === "object" && candidate.evidence !== null ? candidate.evidence as Record<string, unknown> : {};
  const sourceIds = Array.isArray(evidenceValue.sourceIds) ? evidenceValue.sourceIds.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).sort() : [sourceId];
  return { ...candidate as unknown as FinanceStatementFacts, sourceId, sourceClass, evidence: { truthClass: "OBSERVED", sourceIds: [...new Set(sourceIds)] }, limitations: Array.isArray(candidate.limitations) ? candidate.limitations.filter((item): item is string => typeof item === "string") : ["statement facts were stored without a valid limitation list"] };
}

function resolveFinanceFireScenario(record: CanonicalRecord, balances: readonly { value: MoneyValue; sourceIds: string[] }[], asOfDate?: string): { input: FireScenarioInput; inputEvidence: Record<string, { truthClass: FinanceFactClass; sourceIds: string[]; note?: string }>; sourceIds: string[] } | { input?: undefined; limitation: string } {
  const data = record.data;
  const sourceId = record.provenance.sourceId ?? record.id;
  const scenarioId = typeof data.scenarioId === "string" && data.scenarioId.trim() ? data.scenarioId.trim() : record.id;
  const currencyValue = typeof data.currency === "string" ? data.currency : undefined;
  if (!currencyValue) return { limitation: "currency is missing" };
  let currency: string;
  try { currency = parseMoney("0", currencyValue).currency; } catch { return { limitation: "currency is invalid" }; }
  const explicitInvestments = recordMoneyFieldAliases(record, ["currentInvestmentsMinor", "currentInvestmentMinor", "currentInvestments"]);
  const matchingBalances = balances.filter((balance) => balance.value.currency === currency);
  const derivedInvestments = matchingBalances.reduce<MoneyValue | undefined>((total, balance) => total ? addMoney(total, balance.value) : balance.value, undefined);
  const currentInvestments = explicitInvestments ?? derivedInvestments;
  if (!currentInvestments) return { limitation: "current investment balance is missing; no statement valuation or finance-investment record is available" };
  const annualContribution = recordMoneyFieldAliases(record, ["annualContributionMinor", "annualContribution"]);
  const annualSpending = recordMoneyFieldAliases(record, ["annualSpendingMinor", "annualSpending", "annualRetirementSpendingMinor"]);
  if (!annualContribution || !annualSpending) return { limitation: "annual contribution or annual spending assumption is missing" };
  if (annualContribution.currency !== currency || annualSpending.currency !== currency || currentInvestments.currency !== currency) return { limitation: "FIRE money inputs use different currencies" };
  const readNumber = (keys: readonly string[]): number | undefined => {
    for (const key of keys) {
      const raw = data[key];
      const value = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : Number.NaN;
      if (Number.isFinite(value)) return value;
    }
    return undefined;
  };
  const retirementDate = typeof data.retirementDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.retirementDate) && Number.isFinite(Date.parse(`${data.retirementDate}T00:00:00Z`)) ? data.retirementDate : undefined;
  const asOf = asOfDate ?? record.effectiveAt ?? record.createdAt;
  const explicitYears = readNumber(["yearsToRetirement"]);
  const derivedYears = retirementDate && Number.isFinite(Date.parse(asOf)) ? Math.max(0, Math.round((Date.parse(`${retirementDate}T00:00:00Z`) - Date.parse(asOf)) / (365.2425 * 86_400_000))) : undefined;
  const yearsToRetirement = explicitYears ?? derivedYears;
  const yearsInRetirement = readNumber(["yearsInRetirement", "longevityYears"]);
  const nominalReturnRate = readNumber(["nominalReturnRate"]);
  const inflationRate = readNumber(["inflationRate"]);
  const annualFeesRate = readNumber(["annualFeesRate", "feesRate"]);
  const effectiveTaxRate = readNumber(["effectiveTaxRate", "taxRate"]);
  const withdrawalRate = readNumber(["withdrawalRate"]);
  const numericInputs = [yearsToRetirement, yearsInRetirement, nominalReturnRate, inflationRate, annualFeesRate, effectiveTaxRate, withdrawalRate];
  if (!numericInputs.every((value): value is number => value !== undefined)) return { limitation: "retirement horizon, date, or one or more explicit return/inflation/fee/tax/withdrawal assumptions are missing" };
  const [resolvedYearsToRetirement, resolvedYearsInRetirement, resolvedNominalReturnRate, resolvedInflationRate, resolvedAnnualFeesRate, resolvedEffectiveTaxRate, resolvedWithdrawalRate] = numericInputs as [number, number, number, number, number, number, number];
  const readReturns = (key: string): number[] | undefined => {
    const value = data[key];
    if (!Array.isArray(value)) return undefined;
    const values = value.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
    return values.length === value.length ? values : undefined;
  };
  const investmentSourceIds = explicitInvestments ? [sourceId] : matchingBalances.flatMap((balance) => balance.sourceIds);
  const sourceIds = [...new Set([sourceId, ...investmentSourceIds])].sort();
  const recordTruth = financeFactClass(record.truthClass);
  const inputEvidence = {
    currentInvestments: { truthClass: explicitInvestments ? recordTruth : "OBSERVED", sourceIds: [...new Set(investmentSourceIds)].sort(), note: explicitInvestments ? "User-admitted scenario input." : "Aggregated from retained investment valuations without duplicating source records." },
    annualContribution: { truthClass: recordTruth, sourceIds: [sourceId], note: "Scenario assumption; not an imported return or advice." },
    annualSpending: { truthClass: recordTruth, sourceIds: [sourceId], note: "Scenario assumption; not a suitability conclusion." },
    retirementDate: { truthClass: recordTruth, sourceIds: [sourceId], note: retirementDate ? "User-admitted retirement date." : "Retirement horizon was supplied directly." },
    returnAndRiskAssumptions: { truthClass: recordTruth, sourceIds: [sourceId], note: "Named user/current-rule assumptions are kept separate from modeled outputs." }
  } satisfies Record<string, { truthClass: FinanceFactClass; sourceIds: string[]; note?: string }>;
  const downsideFirstReturns = readReturns("downsideFirstReturns");
  const upsideFirstReturns = readReturns("upsideFirstReturns");
  return { input: { scenarioId, ...(retirementDate ? { retirementDate } : {}), currency, currentInvestments, annualContribution, annualSpending, yearsToRetirement: resolvedYearsToRetirement, yearsInRetirement: resolvedYearsInRetirement, nominalReturnRate: resolvedNominalReturnRate, inflationRate: resolvedInflationRate, annualFeesRate: resolvedAnnualFeesRate, effectiveTaxRate: resolvedEffectiveTaxRate, withdrawalRate: resolvedWithdrawalRate, ...(downsideFirstReturns ? { downsideFirstReturns } : {}), ...(upsideFirstReturns ? { upsideFirstReturns } : {}) }, inputEvidence, sourceIds };
}

function recordMoneyFieldAliases(record: CanonicalRecord, fields: readonly string[]): MoneyValue | undefined {
  for (const field of fields) {
    const value = recordMoneyField(record, field);
    if (value) return value;
  }
  return undefined;
}

/** Convert only canonical first-party Finance records; malformed records stay out of the projection. */
export function toFinanceTransaction(record: CanonicalRecord): FinanceTransaction | undefined {
  if (record.deleted || record.owner !== "domain.finance") return undefined;
  const kind = typeof record.data.kind === "string" ? record.data.kind : "";
  if (kind !== "finance-transaction" && kind !== "expense") return undefined;
  const currency = typeof record.data.currency === "string" ? record.data.currency : "";
  const amountMinor = typeof record.data.amountMinor === "string" || typeof record.data.amountMinor === "number" ? String(record.data.amountMinor) : "";
  if (!currency || !/^-?\d+$/.test(amountMinor)) return undefined;
  let money: MoneyValue;
  try {
    money = parseMoneyMinor(amountMinor, currency);
  } catch {
    return undefined;
  }
  if (kind === "expense" && BigInt(money.amountMinor) > 0n) money = { ...money, amountMinor: (-BigInt(money.amountMinor)).toString() };
  const postedAt = typeof record.data.postedAt === "string" && Number.isFinite(Date.parse(record.data.postedAt)) ? new Date(record.data.postedAt).toISOString() : record.effectiveAt ?? record.createdAt;
  const description = typeof record.data.description === "string" ? record.data.description : typeof record.data.merchant === "string" ? record.data.merchant : record.data.text && typeof record.data.text === "string" ? record.data.text : kind;
  const merchant = typeof record.data.merchant === "string" && record.data.merchant.trim() ? record.data.merchant.trim().toLocaleLowerCase("en-CA") : description.trim().toLocaleLowerCase("en-CA");
  const statusValue = typeof record.data.status === "string" && FINANCE_STATUSES.has(record.data.status as FinanceTransactionStatus) ? record.data.status as FinanceTransactionStatus : "POSTED";
  const accountId = typeof record.data.accountId === "string" && record.data.accountId.trim() ? record.data.accountId : "captured-expenses";
  const sourceId = typeof record.provenance.sourceId === "string" && record.provenance.sourceId.trim() ? record.provenance.sourceId : record.id;
  const lineage = record.data.financeLineage && typeof record.data.financeLineage === "object" ? record.data.financeLineage as Partial<FinanceLineage> : undefined;
  const naturalKey = typeof record.data.naturalKey === "string" && record.data.naturalKey.trim() ? record.data.naturalKey : `${accountId}|${postedAt.slice(0, 10)}|${money.currency}|${money.amountMinor}|${merchant}`;
  return {
    id: record.id,
    accountId,
    postedAt,
    description: description.slice(0, 500),
    merchant: merchant.slice(0, 160),
    amount: money,
    direction: BigInt(money.amountMinor) > 0n ? "INFLOW" : BigInt(money.amountMinor) < 0n ? "OUTFLOW" : "NEUTRAL",
    status: statusValue,
    ...(record.data.essential === true ? { essential: true } : {}),
    ...(typeof record.data.sourceTransactionId === "string" && record.data.sourceTransactionId ? { sourceTransactionId: record.data.sourceTransactionId } : {}),
    naturalKey,
    lineage: {
      sourceId: typeof lineage?.sourceId === "string" && lineage.sourceId ? lineage.sourceId : sourceId,
      sourceSha256: typeof lineage?.sourceSha256 === "string" && lineage.sourceSha256 ? lineage.sourceSha256 : "0".repeat(64),
      sourceRow: typeof lineage?.sourceRow === "number" && Number.isSafeInteger(lineage.sourceRow) ? lineage.sourceRow : 0,
      parserProfile: lineage?.parserProfile === "CSV_HEADER_V1" ? "CSV_HEADER_V1" : "STRUCTURED_V1",
      rawFields: lineage?.rawFields && typeof lineage.rawFields === "object" ? lineage.rawFields as Record<string, string> : {}
    }
  };
}

function isFinanceNode(record: CanonicalRecord): boolean {
  return !record.deleted && (record.owner === "domain.finance" || (typeof record.data.kind === "string" && FINANCE_NODE_KINDS.has(record.data.kind)) || isAuthorizedCrossDomainProjection(record));
}

function projectCrossDomainFinance(records: readonly CanonicalRecord[], impact: DependencyImpact, financeNodeIds: ReadonlySet<string>): FinanceCrossDomainProjection {
  const travelPlans: FinanceTravelPlanProjection[] = [];
  const compensationChanges: FinanceCompensationProjection[] = [];
  const cashFlowByMonth = new Map<string, MoneyValue>();
  const limitations = new Set<string>();
  for (const record of records) {
    if (!isAuthorizedCrossDomainProjection(record)) continue;
    const projection = record.data.financeProjection as Record<string, unknown>;
    const sourceIds = [record.provenance.sourceId ?? record.id];
    const truthClass = financeFactClass(record.truthClass);
    if (record.data.kind === "travel-plan") {
      const estimatedCost = readExternalMoney(projection, "estimatedCostMinor");
      const dueDate = readDateOnly(projection.dueDate ?? projection.targetDate);
      if (!estimatedCost || !dueDate || BigInt(estimatedCost.amountMinor) < 0n) {
        limitations.add(`${record.id}: travel financial projection is incomplete`);
        continue;
      }
      const item = { sourceId: record.id, label: readExternalLabel(projection, record.data.label, record.id), estimatedCost, dueDate, truthClass, sourceIds } satisfies FinanceTravelPlanProjection;
      travelPlans.push(item);
      addMonthlyCashFlow(cashFlowByMonth, dueDate.slice(0, 7), { ...estimatedCost, amountMinor: (-BigInt(estimatedCost.amountMinor)).toString() });
      continue;
    }
    if (record.data.kind === "compensation-change") {
      const monthlyIncome = readExternalMoney(projection, "monthlyAmountMinor");
      const effectiveDate = readDateOnly(projection.effectiveDate);
      if (!monthlyIncome || !effectiveDate || BigInt(monthlyIncome.amountMinor) < 0n) {
        limitations.add(`${record.id}: compensation financial projection is incomplete`);
        continue;
      }
      const item = { sourceId: record.id, label: readExternalLabel(projection, record.data.label, record.id), monthlyIncome, effectiveDate, truthClass, sourceIds } satisfies FinanceCompensationProjection;
      compensationChanges.push(item);
      addMonthlyCashFlow(cashFlowByMonth, effectiveDate.slice(0, 7), monthlyIncome);
    }
  }
  const affectedFinanceIds = impact.affectedIds.filter((id) => financeNodeIds.has(id) && !travelPlans.some((item) => item.sourceId === id) && !compensationChanges.some((item) => item.sourceId === id));
  return {
    travelPlans: travelPlans.sort((left, right) => left.sourceId.localeCompare(right.sourceId)),
    compensationChanges: compensationChanges.sort((left, right) => left.sourceId.localeCompare(right.sourceId)),
    cashFlowByMonth: Object.fromEntries([...cashFlowByMonth.entries()].sort(([left], [right]) => left.localeCompare(right))),
    affectedFinanceIds: [...new Set(affectedFinanceIds)].sort(),
    sourceIds: [...new Set([...travelPlans, ...compensationChanges].flatMap((item) => item.sourceIds))].sort(),
    limitations: [...limitations].sort()
  };
}

function isAuthorizedCrossDomainProjection(record: CanonicalRecord): boolean {
  if (record.deleted || (record.data.kind !== "travel-plan" && record.data.kind !== "compensation-change")) return false;
  const projection = record.data.financeProjection;
  return typeof projection === "object" && projection !== null && (projection as Record<string, unknown>).authorized === true;
}

function readExternalMoney(projection: Record<string, unknown>, field: string): MoneyValue | undefined {
  const amount = typeof projection[field] === "string" || typeof projection[field] === "number" ? String(projection[field]) : "";
  const currency = typeof projection.currency === "string" ? projection.currency : "";
  if (!/^-?\d+$/.test(amount) || !currency) return undefined;
  try {
    const normalized = parseMoney("0", currency).currency;
    const value = BigInt(amount);
    if (value < 0n || value > 2n ** 63n - 1n) return undefined;
    return { amountMinor: value.toString(), currency: normalized };
  } catch {
    return undefined;
  }
}

function readDateOnly(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value ? value : undefined;
}

function readExternalLabel(projection: Record<string, unknown>, fallback: unknown, id: string): string {
  const label = typeof projection.label === "string" ? projection.label.trim() : typeof fallback === "string" ? fallback.trim() : "";
  return (label || id).slice(0, 240);
}

function addMonthlyCashFlow(target: Map<string, MoneyValue>, month: string, value: MoneyValue): void {
  const key = `${month}:${value.currency}`;
  const current = target.get(key);
  target.set(key, current ? addMoney(current, value) : value);
}

function financeNodeLabel(record: CanonicalRecord): string {
  const data = record.data;
  for (const value of [data.label, data.name, data.merchant, data.goalId, data.accountId, data.text]) if (typeof value === "string" && value.trim()) return value.trim().slice(0, 240);
  return record.id;
}

function recordMoney(record: CanonicalRecord): MoneyValue | undefined {
  const amount = typeof record.data.amountMinor === "string" || typeof record.data.amountMinor === "number" ? String(record.data.amountMinor) : "";
  const currency = typeof record.data.currency === "string" ? record.data.currency : "";
  if (!/^-?\d+$/.test(amount) || !currency) return undefined;
  try {
    return { amountMinor: BigInt(amount).toString(), currency: parseMoney("0", currency).currency };
  } catch {
    return undefined;
  }
}

function recordMoneyField(record: CanonicalRecord, field: string): MoneyValue | undefined {
  const amount = typeof record.data[field] === "string" || typeof record.data[field] === "number" ? String(record.data[field]) : "";
  const currency = typeof record.data.currency === "string" ? record.data.currency : "";
  if (!/^-?\d+$/.test(amount) || !currency) return undefined;
  try {
    return { amountMinor: BigInt(amount).toString(), currency: parseMoney("0", currency).currency };
  } catch {
    return undefined;
  }
}

function sourceIdsForRecord(record: CanonicalRecord): string[] {
  const sourceId = record.provenance.sourceId;
  return sourceId ? [sourceId] : [record.id];
}

function financeFactClass(truthClass: TruthClass): FinanceFactClass {
  if (truthClass === "IMPORTED_RECORD" || truthClass === "USER_OBSERVATION") return "OBSERVED";
  if (truthClass === "SOURCE_CLAIM") return "CURRENT_EXTERNAL";
  if (truthClass === "ASSUMPTION") return "ASSUMPTION";
  if (truthClass === "ESTIMATE") return "UNKNOWN";
  if (truthClass === "AI_HYPOTHESIS") return "UNKNOWN";
  if (truthClass === "DERIVED") return "DERIVED";
  return "UNKNOWN";
}

function resolveCurrency(preferred: string | undefined, available: readonly string[]): string | undefined {
  if (preferred) {
    try {
      const normalized = parseMoney("0", preferred).currency;
      return available.includes(normalized) ? normalized : undefined;
    } catch {
      return undefined;
    }
  }
  return available.includes("CAD") ? "CAD" : available[0];
}

function parseMoneyMinor(amountMinor: string, currency: string): MoneyValue {
  const normalized = parseMoney("0", currency).currency;
  if (!/^-?\d+$/.test(amountMinor)) throw new Error("Invalid minor amount");
  const value = BigInt(amountMinor);
  if (value < -(2n ** 63n) || value > 2n ** 63n - 1n) throw new Error("Minor amount is outside the supported range");
  return { amountMinor: value.toString(), currency: normalized };
}
