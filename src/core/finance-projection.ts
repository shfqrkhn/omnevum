import { projectDependencyGraph, projectDependencyImpact, type DependencyGraph, type DependencyImpact } from "./dependency-graph";
import { parseMoney, type MoneyValue } from "./money";
import type { CanonicalRecord, TruthClass } from "./model";
import type { FinanceLineage, FinanceTransaction, FinanceTransactionStatus } from "./finance";
import { assessFinanceDataQuality, analyzeFinanceGraph, detectFinanceReviewCases, inferFinanceRecurringPatterns, summarizeFinanceTransactions, type FinanceDataQuality, type FinanceDependencyGraph, type FinanceFactClass, type FinanceForecastVintage, type FinanceGraphAnalysis, type FinanceRecurringPattern, type FinanceReviewCase, type FinanceTransactionSummary } from "./finance-model";

/**
 * Read-only Finance projection over canonical records and the shared typed
 * relationship graph. It deliberately owns no durable state: imported rows,
 * captured expenses, goals, and links remain owned by their normal commands.
 */
export interface FinanceProjectionOptions {
  currency?: string;
  requiredPeriods?: readonly string[];
  changedIds?: readonly string[];
  forecastVintages?: readonly FinanceForecastVintage[];
}

export interface FinanceProjection {
  status: "NO_DATA" | "LIMITED" | "READY";
  currency?: string;
  transactionCount: number;
  accountIds: string[];
  sourceIds: string[];
  summariesByCurrency: Record<string, FinanceTransactionSummary>;
  summary?: FinanceTransactionSummary;
  recurringPatterns: FinanceRecurringPattern[];
  reviewCases: FinanceReviewCase[];
  quality: FinanceDataQuality;
  dependencyGraph: DependencyGraph;
  dependencyImpact: DependencyImpact;
  financeGraph: FinanceDependencyGraph;
  financeGraphAnalysis: FinanceGraphAnalysis;
  invalidatedFinanceIds: string[];
  forecastVintages: FinanceForecastVintage[];
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
  "finance-fire"
]);

const FINANCE_STATUSES = new Set<FinanceTransactionStatus>(["PENDING", "POSTED", "REVERSED", "REFUNDED", "VOIDED", "CORRECTED", "UNKNOWN"]);

export function projectFinanceState(records: readonly CanonicalRecord[], options: FinanceProjectionOptions = {}): FinanceProjection {
  const activeRecords = records.filter((record) => !record.deleted);
  const transactions = activeRecords.map(toFinanceTransaction).filter((transaction): transaction is FinanceTransaction => transaction !== undefined);
  const byCurrency = new Map<string, FinanceTransaction[]>();
  for (const transaction of transactions) byCurrency.set(transaction.amount.currency, [...(byCurrency.get(transaction.amount.currency) ?? []), transaction]);
  const summariesByCurrency: Record<string, FinanceTransactionSummary> = {};
  for (const currency of [...byCurrency.keys()].sort()) summariesByCurrency[currency] = summarizeFinanceTransactions(byCurrency.get(currency) ?? [], currency);
  const currency = resolveCurrency(options.currency, [...byCurrency.keys()]);
  const summary = currency ? summariesByCurrency[currency] : undefined;
  const selectedTransactions = currency ? byCurrency.get(currency) ?? [] : transactions;
  const recurringPatterns = inferFinanceRecurringPatterns(selectedTransactions);
  const reviewCases = detectFinanceReviewCases(selectedTransactions);
  const availablePeriods = [...new Set(selectedTransactions.map((transaction) => transaction.postedAt.slice(0, 7)))].sort();
  const quality = assessFinanceDataQuality({
    requiredPeriods: [...(options.requiredPeriods ?? [])],
    availablePeriods,
    unresolvedReviewCases: reviewCases.filter((review) => review.disposition === "UNRESOLVED").length
  });
  const dependencyGraph = projectDependencyGraph([...activeRecords]);
  const dependencyImpact = projectDependencyImpact(dependencyGraph, [...(options.changedIds ?? [])]);
  const financeNodeIds = new Set(activeRecords.filter(isFinanceNode).map((record) => record.id));
  const financeGraph: FinanceDependencyGraph = {
    nodes: activeRecords.filter((record) => financeNodeIds.has(record.id)).map((record) => ({ id: record.id, label: financeNodeLabel(record), evidence: { truthClass: financeFactClass(record.truthClass), sourceIds: sourceIdsForRecord(record), note: "Read-only Finance projection over the canonical record." } })).sort((left, right) => left.id.localeCompare(right.id)),
    edges: dependencyGraph.edges.filter((edge) => financeNodeIds.has(edge.sourceId) && financeNodeIds.has(edge.targetId)).map((edge) => ({ id: edge.id, from: edge.sourceId, to: edge.targetId, kind: edge.edgeKind, ...(edge.scenarioId ? { scenarioId: edge.scenarioId } : {}), evidence: { truthClass: financeFactClass(edge.evidence?.truthClass ?? "DERIVED"), sourceIds: edge.evidence?.sourceIds ?? [edge.id], note: "Typed relationship is projected without granting permission or creating a second owner." } })).sort((left, right) => left.id.localeCompare(right.id))
  };
  const financeGraphAnalysis = analyzeFinanceGraph(financeGraph);
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
    recurringPatterns,
    reviewCases,
    quality: transactions.length === 0 ? { ...quality, status: "UNKNOWN", limitations: ["no Finance transactions are available for this projection"] } : quality,
    dependencyGraph,
    dependencyImpact,
    financeGraph,
    financeGraphAnalysis,
    invalidatedFinanceIds,
    forecastVintages: [...(options.forecastVintages ?? [])]
  };
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
  return !record.deleted && (record.owner === "domain.finance" || (typeof record.data.kind === "string" && FINANCE_NODE_KINDS.has(record.data.kind)));
}

function financeNodeLabel(record: CanonicalRecord): string {
  const data = record.data;
  for (const value of [data.label, data.name, data.merchant, data.goalId, data.accountId, data.text]) if (typeof value === "string" && value.trim()) return value.trim().slice(0, 240);
  return record.id;
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
