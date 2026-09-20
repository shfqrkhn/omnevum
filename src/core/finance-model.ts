import { addMoney, parseMoney, subtractMoney, type MoneyValue } from "./money";
import type { FinanceSourceClass, FinanceTransaction } from "./finance";
export type { FinanceSourceClass } from "./finance";

/**
 * Finance facts deliberately carry a truth class so a projection cannot be
 * mistaken for an imported statement value or a user-adopted plan.
 */
export type FinanceFactClass = "OBSERVED" | "CURRENT_EXTERNAL" | "ASSUMPTION" | "DERIVED" | "MODELED" | "FORECAST" | "TARGET" | "UNKNOWN";

export interface FinanceEvidence {
  truthClass: FinanceFactClass;
  sourceIds: string[];
  note?: string;
}

export type FinanceGraphEdgeKind = "DEPENDENCY" | "ALLOCATION" | "SYNERGY" | "CONFLICT" | "FEEDBACK";

export interface FinanceGraphNode {
  id: string;
  label: string;
  evidence: FinanceEvidence;
}

export interface FinanceGraphEdge {
  id: string;
  from: string;
  to: string;
  kind: FinanceGraphEdgeKind;
  evidence: FinanceEvidence;
  scenarioId?: string;
  allocationMode?: "EXCLUSIVE" | "ENABLING";
  allocation?: MoneyValue;
}

export interface FinanceDependencyGraph {
  nodes: FinanceGraphNode[];
  edges: FinanceGraphEdge[];
}

export interface FinanceGraphAnalysis {
  order: string[];
  cycleNodeIds: string[];
  cycleEdgeIds: string[];
  ignoredScenarioEdgeIds: string[];
  feedbackEdgeIds: string[];
}

export interface FinancePropagationResult {
  scenarioId?: string;
  values: Record<string, number>;
  changedNodeIds: string[];
  invalidatedNodeIds: string[];
  graph: FinanceGraphAnalysis;
}

export interface FinanceWhatIfChange {
  nodeId: string;
  value: number;
  label: string;
  reason?: string;
}

export interface FinanceWhatIfAlternativeInput {
  id: string;
  label: string;
  changes: readonly FinanceWhatIfChange[];
}

export interface FinanceWhatIfAssumption extends FinanceWhatIfChange {
  baselineValue?: number;
  delta?: number;
}

export interface FinanceWhatIfAlternativeResult {
  id: string;
  label: string;
  assumptions: FinanceWhatIfAssumption[];
  values: Record<string, number>;
  changedNodeIds: string[];
  invalidatedNodeIds: string[];
}

export interface FinanceWhatIfOptions {
  scenarioId: string;
  derive: NonNullable<FinancePropagationOptions["derive"]>;
  fixedNodeIds?: readonly string[];
  alternatives?: readonly FinanceWhatIfAlternativeInput[];
  maxChanges?: number;
  maxAlternatives?: number;
}

export interface FinanceWhatIfResult {
  scenarioId: string;
  baselineValues: Record<string, number>;
  assumptions: FinanceWhatIfAssumption[];
  values: Record<string, number>;
  changedNodeIds: string[];
  invalidatedNodeIds: string[];
  alternatives: FinanceWhatIfAlternativeResult[];
  graph: FinanceGraphAnalysis;
  truthClass: "MODELED";
  limitations: string[];
}

const propagationEdgeKinds = new Set<FinanceGraphEdgeKind>(["DEPENDENCY", "ALLOCATION"]);

/**
 * Analyze only ordinary dependency/allocation edges. Synergy and conflict
 * edges are explanatory relationships; feedback edges require the explicit
 * solver below and can never mutate baseline state through this path.
 */
export function analyzeFinanceGraph(graph: FinanceDependencyGraph, scenarioId?: string): FinanceGraphAnalysis {
  const nodeIds = new Set<string>();
  for (const node of graph.nodes) {
    if (!node.id.trim() || nodeIds.has(node.id)) throw new Error("Finance graph node IDs must be unique and non-empty");
    nodeIds.add(node.id);
  }
  const activeEdges: FinanceGraphEdge[] = [];
  const ignoredScenarioEdgeIds: string[] = [];
  const feedbackEdgeIds: string[] = [];
  const edgeIds = new Set<string>();
  for (const edge of graph.edges) {
    if (!edge.id.trim() || edgeIds.has(edge.id)) throw new Error("Finance graph edge IDs must be unique and non-empty");
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) throw new Error(`Finance graph edge ${edge.id} references a missing node`);
    if (edge.from === edge.to && edge.kind !== "FEEDBACK") throw new Error(`Finance graph edge ${edge.id} is a self-cycle`);
    if (edge.kind === "FEEDBACK") {
      feedbackEdgeIds.push(edge.id);
      continue;
    }
    if (edge.scenarioId !== undefined && edge.scenarioId !== scenarioId) {
      ignoredScenarioEdgeIds.push(edge.id);
      continue;
    }
    if (propagationEdgeKinds.has(edge.kind)) activeEdges.push(edge);
  }

  const indegree = new Map<string, number>(graph.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map<string, FinanceGraphEdge[]>();
  for (const edge of activeEdges) {
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge]);
  }
  const ready = graph.nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id).sort();
  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    order.push(id);
    for (const edge of outgoing.get(id) ?? []) {
      const next = (indegree.get(edge.to) ?? 0) - 1;
      indegree.set(edge.to, next);
      if (next === 0) {
        ready.push(edge.to);
        ready.sort();
      }
    }
  }
  const ordered = new Set(order);
  const cycleNodeIds = graph.nodes.map((node) => node.id).filter((id) => !ordered.has(id)).sort();
  const cycleSet = new Set(cycleNodeIds);
  const cycleEdgeIds = activeEdges.filter((edge) => cycleSet.has(edge.from) && cycleSet.has(edge.to)).map((edge) => edge.id).sort();
  return { order, cycleNodeIds, cycleEdgeIds, ignoredScenarioEdgeIds: ignoredScenarioEdgeIds.sort(), feedbackEdgeIds: feedbackEdgeIds.sort() };
}

export interface FinancePropagationOptions {
  scenarioId?: string;
  fixedNodeIds?: readonly string[];
  derive?: (nodeId: string, inputValues: number[], currentValue: number | undefined) => number | undefined;
}

/**
 * Recomputes a projection without mutating the graph or the supplied values.
 * Cyclic nodes and their downstream dependants are invalidated instead of
 * being resolved by arbitrary ordering. Scenario edges are selected only when
 * the same scenario ID is explicitly requested.
 */
export function propagateFinanceGraph(graph: FinanceDependencyGraph, initialValues: Record<string, number>, options: FinancePropagationOptions = {}): FinancePropagationResult {
  const analysis = analyzeFinanceGraph(graph, options.scenarioId);
  const values = { ...initialValues };
  const fixed = new Set(options.fixedNodeIds ?? []);
  const invalidated = new Set(analysis.cycleNodeIds);
  const activeEdges = graph.edges.filter((edge) => {
    if (!propagationEdgeKinds.has(edge.kind)) return false;
    if (edge.scenarioId !== undefined && edge.scenarioId !== options.scenarioId) return false;
    return true;
  });
  for (const nodeId of analysis.order) {
    if (fixed.has(nodeId)) continue;
    if (invalidated.has(nodeId)) continue;
    const incoming = activeEdges.filter((edge) => edge.to === nodeId);
    if (incoming.length === 0 || !options.derive) continue;
    if (incoming.some((edge) => invalidated.has(edge.from))) {
      invalidated.add(nodeId);
      continue;
    }
    const inputValues = incoming.map((edge) => values[edge.from]).filter((value): value is number => Number.isFinite(value));
    const next = options.derive(nodeId, inputValues, values[nodeId]);
    if (next !== undefined && Number.isFinite(next)) values[nodeId] = next;
  }
  const downstream = new Map<string, string[]>();
  for (const edge of activeEdges) downstream.set(edge.from, [...(downstream.get(edge.from) ?? []), edge.to]);
  const queue = [...invalidated];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const child of downstream.get(id) ?? []) {
      if (!invalidated.has(child)) {
        invalidated.add(child);
        queue.push(child);
      }
    }
  }
  const changedNodeIds = Object.keys(values).filter((id) => values[id] !== initialValues[id]).sort();
  return { ...(options.scenarioId ? { scenarioId: options.scenarioId } : {}), values, changedNodeIds, invalidatedNodeIds: [...invalidated].sort(), graph: analysis };
}

/**
 * Evaluate an isolated, bounded what-if without changing adopted values.
 * Changes and alternatives are explicit inputs; this function never invents
 * a recommendation and never writes through a canonical owner.
 */
export function evaluateFinanceWhatIf(graph: FinanceDependencyGraph, baselineValues: Record<string, number>, changes: readonly FinanceWhatIfChange[], options: FinanceWhatIfOptions): FinanceWhatIfResult {
  if (!options.scenarioId.trim()) throw new Error("A what-if scenario ID is required");
  const maxChanges = options.maxChanges ?? 32;
  const maxAlternatives = options.maxAlternatives ?? 8;
  if (!Number.isInteger(maxChanges) || maxChanges < 1 || maxChanges > 128 || !Number.isInteger(maxAlternatives) || maxAlternatives < 0 || maxAlternatives > 32) throw new Error("What-if bounds are invalid");
  const graphNodeIds = new Set(graph.nodes.map((node) => node.id));
  const analysis = analyzeFinanceGraph(graph, options.scenarioId);
  const normalizeChanges = (items: readonly FinanceWhatIfChange[]): FinanceWhatIfAssumption[] => {
    if (items.length === 0 || items.length > maxChanges) throw new Error("What-if changes are outside the supported bound");
    const seen = new Set<string>();
    return [...items].map((change) => {
      if (!graphNodeIds.has(change.nodeId) || !change.nodeId.trim()) throw new Error(`What-if change references an unknown node: ${change.nodeId}`);
      if (seen.has(change.nodeId)) throw new Error("What-if change node IDs must be unique");
      seen.add(change.nodeId);
      if (!Number.isFinite(change.value) || Math.abs(change.value) > Number.MAX_SAFE_INTEGER) throw new Error("What-if values must be finite and bounded");
      if (!change.label.trim()) throw new Error("What-if change labels are required");
      const baselineValue = baselineValues[change.nodeId];
      return { ...change, label: change.label.trim().slice(0, 240), ...(baselineValue !== undefined ? { baselineValue, delta: change.value - baselineValue } : {}) };
    }).sort((left, right) => left.nodeId.localeCompare(right.nodeId));
  };
  const project = (items: readonly FinanceWhatIfChange[]): FinancePropagationResult => {
    const assumptions = normalizeChanges(items);
    const scenarioValues = { ...baselineValues };
    for (const assumption of assumptions) scenarioValues[assumption.nodeId] = assumption.value;
    return propagateFinanceGraph(graph, scenarioValues, { scenarioId: options.scenarioId, derive: options.derive, fixedNodeIds: [...new Set([...(options.fixedNodeIds ?? []), ...assumptions.map((assumption) => assumption.nodeId)])] });
  };
  const assumptions = normalizeChanges(changes);
  const main = project(changes);
  if (options.alternatives && options.alternatives.length > maxAlternatives) throw new Error("What-if alternatives are outside the supported bound");
  const alternativeIds = new Set<string>();
  const alternatives = [...(options.alternatives ?? [])].map((alternative) => {
    if (!alternative.id.trim() || !alternative.label.trim() || alternative.id === options.scenarioId || alternativeIds.has(alternative.id)) throw new Error("What-if alternative identities must be unique and non-empty");
    alternativeIds.add(alternative.id);
    const result = project(alternative.changes);
    return { id: alternative.id, label: alternative.label.trim().slice(0, 240), assumptions: normalizeChanges(alternative.changes), values: result.values, changedNodeIds: result.changedNodeIds, invalidatedNodeIds: result.invalidatedNodeIds };
  }).sort((left, right) => left.id.localeCompare(right.id));
  return {
    scenarioId: options.scenarioId,
    baselineValues: { ...baselineValues },
    assumptions,
    values: main.values,
    changedNodeIds: main.changedNodeIds,
    invalidatedNodeIds: main.invalidatedNodeIds,
    alternatives,
    graph: analysis,
    truthClass: "MODELED",
    limitations: [
      ...(main.invalidatedNodeIds.length > 0 ? ["cyclic or dependent values remain invalidated rather than being resolved by arbitrary ordering"] : []),
      "what-if values are modeled alternatives and do not mutate the adopted plan"
    ]
  };
}

export interface FinanceFeedbackLoopOptions {
  scenarioId: string;
  maxIterations?: number;
  tolerance?: number;
}

export interface FinanceFeedbackLoopResult {
  scenarioId: string;
  status: "CONVERGED" | "NON_CONVERGED" | "INVALID";
  iterations: number;
  values: Record<string, number>;
  maxDelta: number;
  truthClass: "MODELED";
}

/** Evaluate a deliberately modeled loop in isolated scenario state. */
export function evaluateFinanceFeedbackLoop(initialValues: Record<string, number>, update: (values: Readonly<Record<string, number>>, iteration: number) => Record<string, number>, options: FinanceFeedbackLoopOptions): FinanceFeedbackLoopResult {
  if (!options.scenarioId.trim()) throw new Error("A feedback scenario ID is required");
  const maxIterations = options.maxIterations ?? 100;
  const tolerance = options.tolerance ?? 0.000001;
  if (!Number.isInteger(maxIterations) || maxIterations < 1 || maxIterations > 10_000 || !Number.isFinite(tolerance) || tolerance < 0) throw new Error("Feedback loop bounds are invalid");
  let values = { ...initialValues };
  let maxDelta = Number.POSITIVE_INFINITY;
  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const next = update(values, iteration);
    if (Object.keys(next).some((key) => !Number.isFinite(next[key]))) return { scenarioId: options.scenarioId, status: "INVALID", iterations: iteration, values, maxDelta: Number.POSITIVE_INFINITY, truthClass: "MODELED" };
    const keys = new Set([...Object.keys(values), ...Object.keys(next)]);
    maxDelta = Math.max(...[...keys].map((key) => Math.abs((next[key] ?? 0) - (values[key] ?? 0))));
    values = { ...next };
    if (maxDelta <= tolerance) return { scenarioId: options.scenarioId, status: "CONVERGED", iterations: iteration, values, maxDelta, truthClass: "MODELED" };
  }
  return { scenarioId: options.scenarioId, status: "NON_CONVERGED", iterations: maxIterations, values, maxDelta, truthClass: "MODELED" };
}

export interface FinanceAllocation {
  id: string;
  resourceId: string;
  goalId: string;
  amount: MoneyValue;
  mode: "EXCLUSIVE" | "ENABLING";
  evidence: FinanceEvidence;
}

export interface FinanceAllocationResult {
  resource: MoneyValue;
  exclusiveAllocated: MoneyValue;
  enablingReferenced: MoneyValue;
  unallocated: MoneyValue;
  overAllocated: MoneyValue;
  byGoal: Record<string, MoneyValue>;
  unmetByGoal: Record<string, MoneyValue>;
  conflictIds: string[];
}

export function allocateFinanceResource(resource: MoneyValue, allocations: readonly FinanceAllocation[], requestedByGoal: Record<string, MoneyValue> = {}, resourceId = "resource"): FinanceAllocationResult {
  if (!resourceId.trim()) throw new Error("Finance resource identity is required");
  assertNonNegativeMoney(resource, "Resource");
  const seen = new Set<string>();
  let exclusive = parseMoney("0", resource.currency);
  let enabling = parseMoney("0", resource.currency);
  const byGoal: Record<string, MoneyValue> = {};
  const conflictIds: string[] = [];
  for (const allocation of allocations) {
    if (seen.has(allocation.id)) throw new Error("Finance allocation IDs must be unique");
    seen.add(allocation.id);
    if (allocation.resourceId.trim() !== resourceId) throw new Error("Allocation resource identity does not match the supplied resource");
    if (!allocation.goalId.trim()) throw new Error("Finance allocation goal identity is required");
    assertNonNegativeMoney(allocation.amount, "Allocation");
    if (allocation.amount.currency !== resource.currency) throw new Error("Finance allocations must use the resource currency");
    const current = byGoal[allocation.goalId] ?? parseMoney("0", resource.currency);
    byGoal[allocation.goalId] = addMoney(current, allocation.amount);
    if (allocation.mode === "EXCLUSIVE") exclusive = addMoney(exclusive, allocation.amount);
    else enabling = addMoney(enabling, allocation.amount);
  }
  const zero = parseMoney("0", resource.currency);
  const overAllocated = positiveDifference(exclusive, resource);
  const unallocated = positiveDifference(resource, exclusive);
  if (BigInt(overAllocated.amountMinor) > 0n) conflictIds.push("RESOURCE_OVER_ALLOCATED");
  const unmetByGoal: Record<string, MoneyValue> = {};
  for (const [goalId, requested] of Object.entries(requestedByGoal)) {
    if (requested.currency !== resource.currency) throw new Error("Requested goal amounts must use the resource currency");
    assertNonNegativeMoney(requested, "Requested goal amount");
    const funded = byGoal[goalId] ?? zero;
    const unmet = positiveDifference(requested, funded);
    if (BigInt(unmet.amountMinor) > 0n) unmetByGoal[goalId] = unmet;
  }
  return { resource, exclusiveAllocated: exclusive, enablingReferenced: enabling, unallocated, overAllocated, byGoal, unmetByGoal, conflictIds };
}

export interface FinanceTransactionSummary {
  currency: string;
  postedIncome: MoneyValue;
  postedSpending: MoneyValue;
  pendingNet: MoneyValue;
  netCashFlow: MoneyValue;
  transferNet: MoneyValue;
  feeSpending: MoneyValue;
  sourceIds: string[];
}

export interface FinanceSummaryOptions {
  /** IDs of both sides of a confirmed cross-account transfer/card payment. */
  excludedTransferIds?: readonly string[];
}

export type FinanceTransferKind = "INTERNAL_TRANSFER" | "CARD_PAYMENT";

export interface FinanceTransferMatch {
  id: string;
  outgoingTransactionId: string;
  incomingTransactionId: string;
  amount: MoneyValue;
  kind: FinanceTransferKind;
  confidence: "HIGH";
  reasons: string[];
  sourceIds: string[];
}

export type FinanceTransferUnresolvedReason = "NO_COUNTERPART" | "AMBIGUOUS_COUNTERPART" | "COUNTERPART_ALREADY_PAIRED";

export interface FinanceTransferUnresolvedMatch {
  id: string;
  transactionId: string;
  direction: "OUTGOING" | "INCOMING";
  amount: MoneyValue;
  kind: FinanceTransferKind;
  candidateTransactionIds: string[];
  reason: FinanceTransferUnresolvedReason;
  sourceIds: string[];
  evidence: FinanceEvidence;
}

export interface FinanceTransferAnalysis {
  matches: FinanceTransferMatch[];
  unmatchedTransactionIds: string[];
  unresolvedMatches: FinanceTransferUnresolvedMatch[];
}

/**
 * Pair only strongly evidenced cross-account movements. The matcher is a
 * projection: it never changes a transaction, creates a permission, or
 * suppresses an unmatched movement. Ties remain unresolved rather than
 * being assigned by arbitrary ordering.
 */
export function matchFinanceTransfers(transactions: readonly FinanceTransaction[], maxDayDistance = 3): FinanceTransferAnalysis {
  if (!Number.isInteger(maxDayDistance) || maxDayDistance < 0 || maxDayDistance > 31) throw new Error("Transfer matching date bound is invalid");
  const candidates = transactions.filter((transaction) => {
    if (transaction.status !== "POSTED" && transaction.status !== "CORRECTED") return false;
    if (BigInt(transaction.amount.amountMinor) === 0n) return false;
    return isTransferLike(transaction.description);
  }).slice().sort((left, right) => left.postedAt.localeCompare(right.postedAt) || left.id.localeCompare(right.id));
  const outgoing = candidates.filter((transaction) => BigInt(transaction.amount.amountMinor) < 0n);
  const incoming = candidates.filter((transaction) => BigInt(transaction.amount.amountMinor) > 0n);
  const matchedIds = new Set<string>();
  const matches: FinanceTransferMatch[] = [];
  const unresolved = new Map<string, FinanceTransferUnresolvedMatch>();
  const addUnresolved = (transaction: FinanceTransaction, candidates: readonly FinanceTransaction[], reason: FinanceTransferUnresolvedReason): void => {
    const kind: FinanceTransferKind = /\b(?:card|credit card|payment to card|card payment)\b/iu.test(transaction.description) ? "CARD_PAYMENT" : "INTERNAL_TRANSFER";
    unresolved.set(transaction.id, {
      id: `finance-transfer-unresolved:${transaction.id}`,
      transactionId: transaction.id,
      direction: BigInt(transaction.amount.amountMinor) < 0n ? "OUTGOING" : "INCOMING",
      amount: { amountMinor: absMinor(transaction.amount.amountMinor), currency: transaction.amount.currency },
      kind,
      candidateTransactionIds: [...new Set(candidates.map((candidate) => candidate.id))].sort(),
      reason,
      sourceIds: [...new Set([transaction.lineage.sourceId, ...candidates.flatMap((candidate) => [candidate.lineage.sourceId])])].sort(),
      evidence: { truthClass: "DERIVED", sourceIds: [transaction.id, ...candidates.map((candidate) => candidate.id)].sort(), note: "The movement remains visible and requires reconciliation; no counterpart was silently selected." }
    });
  };
  for (const debit of outgoing) {
    const allCandidates = incoming.filter((credit) => {
      if (credit.accountId === debit.accountId || credit.amount.currency !== debit.amount.currency) return false;
      if (absMinor(credit.amount.amountMinor) !== absMinor(debit.amount.amountMinor)) return false;
      return dayDistance(debit.postedAt, credit.postedAt) <= maxDayDistance;
    });
    const ranked = allCandidates.filter((credit) => !matchedIds.has(credit.id)).map((credit) => ({ credit, score: transferMatchScore(debit, credit, maxDayDistance) })).sort((left, right) => right.score - left.score || left.credit.id.localeCompare(right.credit.id));
    if (ranked.length === 0) {
      addUnresolved(debit, allCandidates, allCandidates.length > 0 ? "COUNTERPART_ALREADY_PAIRED" : "NO_COUNTERPART");
      continue;
    }
    const best = ranked[0]!;
    const tied = ranked.filter((candidate) => candidate.score === best.score).map((candidate) => candidate.credit);
    if (tied.length > 1) {
      addUnresolved(debit, tied, "AMBIGUOUS_COUNTERPART");
      continue;
    }
    const credit = best.credit;
    matchedIds.add(debit.id);
    matchedIds.add(credit.id);
    const kind: FinanceTransferKind = /\b(?:card|credit card|payment to card|card payment)\b/iu.test(`${debit.description} ${credit.description}`) ? "CARD_PAYMENT" : "INTERNAL_TRANSFER";
    matches.push({
      id: `finance-transfer:${debit.id}:${credit.id}`,
      outgoingTransactionId: debit.id,
      incomingTransactionId: credit.id,
      amount: { amountMinor: absMinor(debit.amount.amountMinor), currency: debit.amount.currency },
      kind,
      confidence: "HIGH",
      reasons: ["equal and opposite exact-money amounts", `postings are within ${maxDayDistance} days`, "transfer-like descriptions", "distinct accounts"],
      sourceIds: [...new Set([debit.lineage.sourceId, credit.lineage.sourceId])].sort()
    });
  }
  for (const credit of incoming) {
    if (!matchedIds.has(credit.id) && !unresolved.has(credit.id)) {
      const possibleDebits = outgoing.filter((debit) => debit.accountId !== credit.accountId && debit.amount.currency === credit.amount.currency && absMinor(debit.amount.amountMinor) === absMinor(credit.amount.amountMinor) && dayDistance(debit.postedAt, credit.postedAt) <= maxDayDistance);
      addUnresolved(credit, possibleDebits, possibleDebits.length > 0 ? "COUNTERPART_ALREADY_PAIRED" : "NO_COUNTERPART");
    }
  }
  return { matches: matches.sort((left, right) => left.id.localeCompare(right.id)), unmatchedTransactionIds: candidates.filter((transaction) => !matchedIds.has(transaction.id)).map((transaction) => transaction.id).sort(), unresolvedMatches: [...unresolved.values()].sort((left, right) => left.id.localeCompare(right.id)) };
}

/** A descriptive projection; it never changes transaction ownership or truth. */
export function summarizeFinanceTransactions(transactions: readonly FinanceTransaction[], currency: string, options: FinanceSummaryOptions = {}): FinanceTransactionSummary {
  const normalizedCurrency = parseMoney("0", currency).currency;
  const excludedTransferIds = new Set(options.excludedTransferIds ?? []);
  let postedIncome = parseMoney("0", normalizedCurrency);
  let postedSpending = parseMoney("0", normalizedCurrency);
  let pendingNet = parseMoney("0", normalizedCurrency);
  let netCashFlow = parseMoney("0", normalizedCurrency);
  let transferNet = parseMoney("0", normalizedCurrency);
  let feeSpending = parseMoney("0", normalizedCurrency);
  for (const transaction of transactions) {
    if (transaction.amount.currency !== normalizedCurrency) continue;
    if (transaction.status === "VOIDED" || transaction.status === "REVERSED") continue;
    if (transaction.status === "PENDING") {
      pendingNet = addMoney(pendingNet, transaction.amount);
      continue;
    }
    if (excludedTransferIds.has(transaction.id)) {
      transferNet = addMoney(transferNet, transaction.amount);
      continue;
    }
    netCashFlow = addMoney(netCashFlow, transaction.amount);
    if (BigInt(transaction.amount.amountMinor) > 0n) postedIncome = addMoney(postedIncome, transaction.amount);
    if (BigInt(transaction.amount.amountMinor) < 0n) {
      const spending = parseMoney("0", normalizedCurrency);
      spending.amountMinor = (-BigInt(transaction.amount.amountMinor)).toString();
      postedSpending = addMoney(postedSpending, spending);
      if (/\b(?:fee|interest|overdraft|atm|foreign exchange|fx)\b/i.test(transaction.description)) feeSpending = addMoney(feeSpending, spending);
    }
  }
  return { currency: normalizedCurrency, postedIncome, postedSpending, pendingNet, netCashFlow, transferNet, feeSpending, sourceIds: [...new Set(transactions.map((transaction) => transaction.lineage.sourceId))].sort() };
}

function isTransferLike(description: string): boolean {
  return /\b(?:transfer|payment to card|card payment|credit card|savings|investment|internal)\b/iu.test(description);
}

function transferMatchScore(debit: FinanceTransaction, credit: FinanceTransaction, maxDayDistance: number): number {
  const distance = dayDistance(debit.postedAt, credit.postedAt);
  const description = `${debit.description} ${credit.description}`;
  return (isTransferLike(debit.description) ? 2 : 0) + (isTransferLike(credit.description) ? 2 : 0) + (/\b(?:card|credit card|payment)\b/iu.test(description) ? 1 : 0) + Math.max(0, maxDayDistance - distance);
}

function dayDistance(left: string, right: string): number {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return Number.POSITIVE_INFINITY;
  return Math.floor(Math.abs(leftTime - rightTime) / 86_400_000);
}

function absMinor(value: string): string {
  const minor = BigInt(value);
  return (minor < 0n ? -minor : minor).toString();
}

export interface FinanceSourceClassification {
  sourceClass: FinanceSourceClass;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  reasons: string[];
}

export function classifyFinanceSource(name: string, headers: readonly string[] = []): FinanceSourceClassification {
  const haystack = `${name} ${headers.join(" ")}`
    .toLocaleLowerCase("en-CA")
    .replace(/[_-]+/gu, " ")
    .replace(/\s+/gu, " ");
  const candidates: Array<[FinanceSourceClass, string, string]> = [
    ["CREDIT_CARD", "credit card|card statement|visa|mastercard|amex", "credit-card terminology"],
    ["INVESTMENT", "investment|broker|brokerage|holding|portfolio|market value", "investment terminology"],
    ["DEBT", "mortgage|loan|line of credit|debt|principal|interest rate", "debt terminology"],
    ["INCOME", "payroll|pay stub|salary|income|wages|employer", "income terminology"],
    ["INSURANCE", "insurance|premium|deductible|coverage|policy", "insurance terminology"],
    ["TAX_BENEFIT", "tax|benefit|refund|assessment", "tax or benefit terminology"],
    ["RECEIPT", "receipt|invoice|purchase", "receipt terminology"]
  ];
  const match = candidates.find(([, pattern]) => new RegExp(pattern, "u").test(haystack));
  if (match) return { sourceClass: match[0], confidence: "HIGH", reasons: [match[2]] };
  if (headers.some((header) => /date|amount|debit|credit|description|merchant/iu.test(header))) return { sourceClass: "TRANSACTION_ACCOUNT", confidence: "MEDIUM", reasons: ["transaction-shaped headers"] };
  return { sourceClass: "UNKNOWN", confidence: "LOW", reasons: ["source identity and headers do not establish a supported class"] };
}

export interface FinanceParserProfile {
  id: string;
  sourceClass: FinanceSourceClass;
  requiredHeaders: string[];
  headerFingerprint: string;
  signConvention: "SIGNED_AMOUNT" | "DEBIT_CREDIT";
}

export interface FinanceParserDrift {
  status: "STABLE" | "DRIFT";
  missingHeaders: string[];
  addedHeaders: string[];
  reason?: string;
}

export function detectFinanceParserDrift(profile: FinanceParserProfile, headers: readonly string[]): FinanceParserDrift {
  const normalized = [...new Set(headers.map(normalizeFinanceHeader).filter(Boolean))].sort();
  const required = [...new Set(profile.requiredHeaders.map(normalizeFinanceHeader).filter(Boolean))].sort();
  const missingHeaders = required.filter((header) => !normalized.includes(header));
  const addedHeaders = normalized.filter((header) => !required.includes(header));
  const fingerprint = normalized.join("|");
  if (missingHeaders.length > 0 || fingerprint !== profile.headerFingerprint || (profile.signConvention === "SIGNED_AMOUNT" && normalized.includes("debit")) || (profile.signConvention === "DEBIT_CREDIT" && normalized.includes("amount"))) {
    return { status: "DRIFT", missingHeaders, addedHeaders, reason: "source structure or sign convention changed; the learned profile must not silently parse this source" };
  }
  return { status: "STABLE", missingHeaders, addedHeaders };
}

export type FinanceCadence = "MONTHLY" | "ANNUAL" | "PERIODIC" | "IRREGULAR";

export interface FinanceRecurringPattern {
  id: string;
  merchant: string;
  amount: MoneyValue;
  occurrenceCount: number;
  medianIntervalDays: number;
  cadence: FinanceCadence;
  nextExpectedAt: string;
  sourceIds: string[];
  evidence: FinanceEvidence;
}

export type FinanceRecurringSignalKind = "MISSING" | "LATE" | "REFUND" | "DUPLICATE" | "PRICE_CHANGE";

export interface FinanceRecurringSignal {
  id: string;
  patternId?: string;
  kind: FinanceRecurringSignalKind;
  severity: "INFO" | "REVIEW";
  transactionIds: string[];
  expectedAt?: string;
  observedAt?: string;
  amount?: MoneyValue;
  reasons: string[];
  sourceIds: string[];
  evidence: FinanceEvidence;
}

export interface FinanceRecurringAnalysis {
  patterns: FinanceRecurringPattern[];
  signals: FinanceRecurringSignal[];
}

export interface FinanceRecurringOptions {
  asOfDate?: string;
  minimumOccurrences?: number;
  graceDays?: number;
}

interface FinanceRecurringGroup {
  key: string;
  entries: FinanceTransaction[];
  pattern: FinanceRecurringPattern | undefined;
}

function recurringGroupKey(transaction: FinanceTransaction): string {
  return `${transaction.accountId}|${transaction.merchant}|${transaction.amount.currency}|${BigInt(transaction.amount.amountMinor) < 0n ? "OUTFLOW" : BigInt(transaction.amount.amountMinor) > 0n ? "INFLOW" : "NEUTRAL"}`;
}

function recurringEligible(transaction: FinanceTransaction): boolean {
  return transaction.status !== "VOIDED" && transaction.status !== "REVERSED" && transaction.status !== "PENDING" && Number.isFinite(Date.parse(transaction.postedAt));
}

function recurringGroups(transactions: readonly FinanceTransaction[]): FinanceRecurringGroup[] {
  const groups = new Map<string, FinanceTransaction[]>();
  for (const transaction of transactions) {
    if (!recurringEligible(transaction)) continue;
    const key = recurringGroupKey(transaction);
    groups.set(key, [...(groups.get(key) ?? []), transaction]);
  }
  return [...groups.entries()].map(([key, entries]) => ({ key, entries: entries.sort((left, right) => Date.parse(left.postedAt) - Date.parse(right.postedAt) || left.id.localeCompare(right.id)), pattern: undefined })).sort((left, right) => left.key.localeCompare(right.key));
}

function recurringPattern(group: FinanceRecurringGroup, minimumOccurrences: number): FinanceRecurringPattern | undefined {
  if (group.entries.length < minimumOccurrences) return undefined;
  const intervals = group.entries.slice(1).map((entry, index) => Math.round((Date.parse(entry.postedAt) - Date.parse(group.entries[index]!.postedAt)) / 86_400_000)).filter((days) => days > 0);
  if (intervals.length === 0) return undefined;
  const medianIntervalDays = median(intervals);
  const cadence: FinanceCadence = medianIntervalDays >= 25 && medianIntervalDays <= 35 ? "MONTHLY" : medianIntervalDays >= 330 && medianIntervalDays <= 395 ? "ANNUAL" : medianIntervalDays >= 7 && medianIntervalDays <= 329 ? "PERIODIC" : "IRREGULAR";
  if (cadence === "IRREGULAR") return undefined;
  const last = group.entries.at(-1)!;
  const nextTime = Date.parse(last.postedAt) + medianIntervalDays * 86_400_000;
  if (!Number.isFinite(nextTime)) return undefined;
  return {
    id: `finance-recurring:${financeModelKey(group.key)}`,
    merchant: last.merchant,
    amount: last.amount,
    occurrenceCount: group.entries.length,
    medianIntervalDays,
    cadence,
    nextExpectedAt: new Date(nextTime).toISOString(),
    sourceIds: [...new Set(group.entries.map((entry) => entry.lineage.sourceId))].sort(),
    evidence: { truthClass: "OBSERVED", sourceIds: [...new Set(group.entries.map((entry) => entry.id))].sort(), note: "Pattern is descriptive; a holiday or known one-off can explain a delayed occurrence." }
  };
}

function recurringToleranceDays(pattern: FinanceRecurringPattern, override?: number): number {
  if (override !== undefined) return override;
  return Math.max(7, Math.ceil(pattern.medianIntervalDays * 0.2));
}

function recurringSignal(pattern: FinanceRecurringPattern | undefined, kind: FinanceRecurringSignalKind, transactionIds: readonly string[], sourceIds: readonly string[], reasons: readonly string[], values: { expectedAt?: string; observedAt?: string; amount?: MoneyValue } = {}): FinanceRecurringSignal {
  const suffix = [...transactionIds].sort().join(":") || "none";
  return {
    id: `finance-recurring-signal:${kind.toLocaleLowerCase("en-CA")}:${financeModelKey(`${pattern?.id ?? "unscoped"}|${suffix}`)}`,
    ...(pattern ? { patternId: pattern.id } : {}),
    kind,
    severity: "REVIEW",
    transactionIds: [...new Set(transactionIds)].sort(),
    ...(values.expectedAt ? { expectedAt: values.expectedAt } : {}),
    ...(values.observedAt ? { observedAt: values.observedAt } : {}),
    ...(values.amount ? { amount: values.amount } : {}),
    reasons: [...new Set(reasons)].sort(),
    sourceIds: [...new Set(sourceIds)].sort(),
    evidence: { truthClass: "DERIVED", sourceIds: [...new Set(transactionIds)].sort(), note: "Recurring signal is descriptive and requires user review; it is not a fraud, refund, or payment recommendation." }
  };
}

function materialAmountChange(current: MoneyValue, baseline: readonly MoneyValue[], minimumPercent = 5): boolean {
  if (baseline.length === 0 || baseline.some((value) => value.currency !== current.currency)) return false;
  const baselineMinor = medianBigInt(baseline.map((value) => (BigInt(value.amountMinor) < 0n ? -BigInt(value.amountMinor) : BigInt(value.amountMinor))));
  const currentMinor = BigInt(current.amountMinor) < 0n ? -BigInt(current.amountMinor) : BigInt(current.amountMinor);
  if (baselineMinor === 0n) return currentMinor !== 0n;
  return (currentMinor > baselineMinor ? currentMinor - baselineMinor : baselineMinor - currentMinor) * 100n >= baselineMinor * BigInt(minimumPercent);
}

export function analyzeFinanceRecurrence(transactions: readonly FinanceTransaction[], options: FinanceRecurringOptions = {}): FinanceRecurringAnalysis {
  const minimumOccurrences = options.minimumOccurrences ?? 3;
  if (!Number.isInteger(minimumOccurrences) || minimumOccurrences < 2 || minimumOccurrences > 100) throw new Error("Recurring-pattern occurrence bound is invalid");
  if (options.graceDays !== undefined && (!Number.isInteger(options.graceDays) || options.graceDays < 0 || options.graceDays > 90)) throw new Error("Recurring-signal grace bound is invalid");
  const asOfTime = options.asOfDate === undefined ? Math.max(...transactions.filter(recurringEligible).map((transaction) => Date.parse(transaction.postedAt)), 0) : Date.parse(options.asOfDate);
  if (!Number.isFinite(asOfTime)) throw new Error("Recurring as-of date is invalid");
  const groups = recurringGroups(transactions);
  for (const group of groups) group.pattern = recurringPattern(group, minimumOccurrences);
  const patterns = groups.flatMap((group) => group.pattern ? [group.pattern] : []);
  const signals: FinanceRecurringSignal[] = [];
  for (const group of groups) {
    const pattern = group.pattern;
    if (!pattern) continue;
    const tolerance = recurringToleranceDays(pattern, options.graceDays);
    for (let index = 1; index < group.entries.length; index += 1) {
      const previous = group.entries[index - 1]!;
      const current = group.entries[index]!;
      const interval = Math.round((Date.parse(current.postedAt) - Date.parse(previous.postedAt)) / 86_400_000);
      if (interval > pattern.medianIntervalDays + tolerance) {
        signals.push(recurringSignal(pattern, "LATE", [previous.id, current.id], [previous.lineage.sourceId, current.lineage.sourceId], [`occurrence arrived ${interval - pattern.medianIntervalDays} days after the learned interval tolerance`], { observedAt: current.postedAt, amount: current.amount }));
      }
      if (index >= 2 && materialAmountChange(current.amount, group.entries.slice(0, index).map((entry) => entry.amount))) {
        signals.push(recurringSignal(pattern, "PRICE_CHANGE", [current.id], [current.lineage.sourceId, ...group.entries.slice(0, index).map((entry) => entry.lineage.sourceId)], ["recurring amount differs materially from its prior observed baseline"], { observedAt: current.postedAt, amount: current.amount }));
      }
    }
    const expectedTime = Date.parse(pattern.nextExpectedAt);
    if (asOfTime > expectedTime + tolerance * 86_400_000) {
      signals.push(recurringSignal(pattern, "MISSING", [group.entries.at(-1)!.id], pattern.sourceIds, [`no ${pattern.cadence.toLocaleLowerCase("en-CA")} occurrence was observed by the supplied as-of date`], { expectedAt: pattern.nextExpectedAt, amount: pattern.amount }));
    }
  }
  const byNaturalKey = new Map<string, FinanceTransaction[]>();
  for (const transaction of transactions.filter(recurringEligible)) byNaturalKey.set(transaction.naturalKey, [...(byNaturalKey.get(transaction.naturalKey) ?? []), transaction]);
  for (const entries of byNaturalKey.values()) {
    if (entries.length < 2) continue;
    const ordered = [...entries].sort((left, right) => Date.parse(left.postedAt) - Date.parse(right.postedAt) || left.id.localeCompare(right.id));
    const group = groups.find((candidate) => candidate.entries.some((entry) => entry.id === ordered[0]!.id));
    for (const duplicate of ordered.slice(1)) signals.push(recurringSignal(group?.pattern, "DUPLICATE", [ordered[0]!.id, duplicate.id], [ordered[0]!.lineage.sourceId, duplicate.lineage.sourceId], ["the same natural transaction identity appears more than once"], { observedAt: duplicate.postedAt, amount: duplicate.amount }));
  }
  const posted = transactions.filter(recurringEligible);
  for (const refund of posted.filter((transaction) => transaction.status === "REFUNDED" || /\b(?:refund|refunded|rebate|cashback|return|reimbursement)\b/iu.test(transaction.description))) {
    const candidates = posted.filter((transaction) => transaction.id !== refund.id && transaction.accountId === refund.accountId && transaction.merchant === refund.merchant && transaction.amount.currency === refund.amount.currency && BigInt(transaction.amount.amountMinor) < 0n && BigInt(refund.amount.amountMinor) > 0n && (BigInt(transaction.amount.amountMinor) === -BigInt(refund.amount.amountMinor)) && Date.parse(transaction.postedAt) <= Date.parse(refund.postedAt));
    const original = candidates.sort((left, right) => Date.parse(right.postedAt) - Date.parse(left.postedAt) || right.id.localeCompare(left.id))[0];
    const explicitRefund = refund.status === "REFUNDED" || /\b(?:refund|refunded|rebate|cashback|return)\b/iu.test(refund.description);
    if (!original && !explicitRefund) continue;
    const delay = original ? Math.round((Date.parse(refund.postedAt) - Date.parse(original.postedAt)) / 86_400_000) : undefined;
    const reasons = [original ? `refund follows the original charge after ${delay} days` : "refund or reimbursement terminology requires reconciliation"];
    if (delay !== undefined && delay > 14) reasons.push("refund arrived later than the bounded review threshold");
    signals.push(recurringSignal(undefined, "REFUND", original ? [original.id, refund.id] : [refund.id], [refund.lineage.sourceId, ...(original ? [original.lineage.sourceId] : [])], reasons, { observedAt: refund.postedAt, amount: refund.amount }));
  }
  return { patterns: patterns.sort((left, right) => left.id.localeCompare(right.id)), signals: signals.sort((left, right) => left.id.localeCompare(right.id)) };
}

export function inferFinanceRecurringPatterns(transactions: readonly FinanceTransaction[], minimumOccurrences = 3): FinanceRecurringPattern[] {
  return analyzeFinanceRecurrence(transactions, { minimumOccurrences }).patterns;
}

export function detectFinanceRecurringSignals(transactions: readonly FinanceTransaction[], options: FinanceRecurringOptions = {}): FinanceRecurringSignal[] {
  return analyzeFinanceRecurrence(transactions, options).signals;
}

export type FinanceReviewPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT_REVIEW";
export type FinanceReviewDisposition = "UNRESOLVED" | "CONFIRMED_LEGITIMATE" | "POSSIBLE_SCAM_OR_COERCION" | "CONFIRMED_UNAUTHORIZED";

export interface FinanceReviewBaseline {
  scope: "MERCHANT" | "ACCOUNT";
  sampleCount: number;
  medianAmount: MoneyValue;
  medianAbsoluteDeviation: MoneyValue;
  upperBound: MoneyValue;
  historyStrength: "WEAK" | "MODERATE" | "STRONG";
}

export interface FinanceReviewCase {
  id: string;
  transactionId: string;
  priority: FinanceReviewPriority;
  disposition: FinanceReviewDisposition;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  reasons: string[];
  sourceIds: string[];
  baseline?: FinanceReviewBaseline;
  evidence: FinanceEvidence;
}

/** Explainable review signals only; this function never labels a transaction fraud. */
export function detectFinanceReviewCases(transactions: readonly FinanceTransaction[]): FinanceReviewCase[] {
  const posted = transactions.filter((transaction) => transaction.status === "POSTED" || transaction.status === "CORRECTED" || transaction.status === "REFUNDED");
  const byMerchant = new Map<string, FinanceTransaction[]>();
  const byAccount = new Map<string, FinanceTransaction[]>();
  for (const transaction of posted) {
    const merchantKey = `${transaction.accountId}|${transaction.merchant}`;
    byMerchant.set(merchantKey, [...(byMerchant.get(merchantKey) ?? []), transaction]);
    byAccount.set(transaction.accountId, [...(byAccount.get(transaction.accountId) ?? []), transaction]);
  }
  const byNaturalKey = new Map<string, FinanceTransaction[]>();
  for (const transaction of posted) byNaturalKey.set(transaction.naturalKey, [...(byNaturalKey.get(transaction.naturalKey) ?? []), transaction]);
  const cases: FinanceReviewCase[] = [];
  for (const transaction of posted) {
    const history = byMerchant.get(`${transaction.accountId}|${transaction.merchant}`) ?? [];
    const prior = history.filter((candidate) => candidate.id !== transaction.id);
    const accountHistory = (byAccount.get(transaction.accountId) ?? []).filter((candidate) => candidate.id !== transaction.id);
    const reasons: string[] = [];
    if (prior.length === 0) reasons.push("first observed merchant in this account history");
    const merchantAmounts = prior.filter((candidate) => candidate.amount.currency === transaction.amount.currency).map((candidate) => candidate.amount);
    const baselineTransactions = merchantAmounts.length > 0 ? prior.filter((candidate) => candidate.amount.currency === transaction.amount.currency) : accountHistory.filter((candidate) => candidate.amount.currency === transaction.amount.currency);
    const baseline = createFinanceReviewBaseline(baselineTransactions, merchantAmounts.length > 0 ? "MERCHANT" : "ACCOUNT", transaction.amount.currency);
    const currentAbsolute = absoluteMoneyMinor(transaction.amount.amountMinor);
    const robustOutlier = baseline && baseline.sampleCount >= 3 ? currentAbsolute > BigInt(baseline.upperBound.amountMinor) : false;
    const weakComparisonOutlier = baseline && baseline.sampleCount > 0 && baseline.sampleCount < 3 && currentAbsolute >= BigInt(baseline.medianAmount.amountMinor) * 3n;
    if (robustOutlier) reasons.push(`amount materially exceeds the ${baseline?.scope === "MERCHANT" ? "merchant's" : "account's"} robust historical range`);
    else if (weakComparisonOutlier) reasons.push("history is insufficient for a robust baseline; the amount comparison is provisional");
    if ((byNaturalKey.get(transaction.naturalKey)?.length ?? 0) > 1) reasons.push("duplicate natural transaction identity appears more than once");
    const sameDay = accountHistory.filter((candidate) => candidate.postedAt.slice(0, 10) === transaction.postedAt.slice(0, 10));
    if (sameDay.length >= 3) reasons.push("rapid repeated sequence on the same posting date");
    if (reasons.length === 0) continue;
    const historyStrength = baseline?.historyStrength ?? "WEAK";
    const confidence: FinanceReviewCase["confidence"] = robustOutlier && historyStrength === "STRONG" || (byNaturalKey.get(transaction.naturalKey)?.length ?? 0) > 1 && accountHistory.length >= 6 ? "HIGH" : baseline && baseline.sampleCount >= 3 ? "MEDIUM" : "LOW";
    const highImpact = robustOutlier && confidence === "HIGH";
    const sourceIds = [...new Set([transaction.lineage.sourceId, ...baselineTransactions.map((candidate) => candidate.lineage.sourceId)])].sort();
    cases.push({ id: `finance-review:${financeModelKey(transaction.id)}`, transactionId: transaction.id, priority: highImpact ? "HIGH" : reasons.length >= 2 ? "MEDIUM" : "LOW", disposition: "UNRESOLVED", confidence, reasons, sourceIds, ...(baseline ? { baseline } : {}), evidence: { truthClass: "DERIVED", sourceIds: [transaction.id, ...baselineTransactions.map((candidate) => candidate.id)].sort(), note: "Signals require user review and do not establish fraud, authorization, or coercion." } });
  }
  return cases.sort((left, right) => left.id.localeCompare(right.id));
}

export interface FinanceReviewContext {
  authenticated?: boolean;
  userInitiated?: boolean;
  familiarMerchant?: boolean;
  possibleScamOrCoercion?: boolean;
  benignExplanation?: string;
  evidence?: string[];
}

export interface FinanceReviewResolution {
  transactionId: string;
  disposition: Exclude<FinanceReviewDisposition, "UNRESOLVED">;
  scope: { accountId: string; merchant?: string };
  reason: string;
  resolvedAt: string;
  sourceIds: string[];
}

export interface FinanceReviewEvaluation {
  cases: FinanceReviewCase[];
  metrics: { resolvedCount: number; confirmedLegitimateCount: number; observableMissedKnownIssueCount: number; available: boolean };
  limitations: string[];
}

/**
 * Adds contextual review evidence without treating authentication, initiation,
 * familiarity, or unusualness as proof of legitimacy or fraud. Resolutions are
 * scoped to an account/merchant and therefore cannot suppress a materially
 * different future transaction.
 */
export function evaluateFinanceReviewCases(
  transactions: readonly FinanceTransaction[],
  contexts: Readonly<Record<string, FinanceReviewContext>> = {},
  resolutions: readonly FinanceReviewResolution[] = [],
  knownIssueTransactionIds: readonly string[] = []
): FinanceReviewEvaluation {
  const byId = new Map(transactions.map((transaction) => [transaction.id, transaction]));
  const cases = new Map(detectFinanceReviewCases(transactions).map((review) => [review.transactionId, review]));
  for (const transaction of transactions) {
    const context = contexts[transaction.id];
    if (!context) continue;
    const review = cases.get(transaction.id);
    const reasons = [...(review?.reasons ?? [])];
    if (context.possibleScamOrCoercion) reasons.push("context indicates possible scam or coercion; user initiation/authentication is not proof of informed legitimacy");
    if (context.authenticated || context.userInitiated || context.familiarMerchant) reasons.push("authentication, user initiation, or merchant familiarity does not establish legitimacy");
    if (context.benignExplanation?.trim()) reasons.push(`possible benign explanation supplied: ${context.benignExplanation.trim().slice(0, 240)}`);
    if (reasons.length === 0) continue;
    const uniqueReasons = [...new Set(reasons)];
    cases.set(transaction.id, {
      id: review?.id ?? `finance-review:${financeModelKey(transaction.id)}`,
      transactionId: transaction.id,
      priority: context.possibleScamOrCoercion ? "URGENT_REVIEW" : review?.priority ?? "MEDIUM",
      disposition: review?.disposition ?? "UNRESOLVED",
      confidence: review?.confidence ?? "LOW",
      reasons: uniqueReasons,
      sourceIds: [...new Set([...(review?.sourceIds ?? []), transaction.lineage.sourceId, ...(context.evidence ?? [])])].sort(),
      evidence: { truthClass: "DERIVED", sourceIds: [transaction.id], note: "Context changes review priority and explanation only; it does not prove authorization, coercion, or fraud." }
    });
  }
  for (const resolution of resolutions) {
    const transaction = byId.get(resolution.transactionId);
    const review = cases.get(resolution.transactionId);
    if (!transaction || !review || transaction.accountId !== resolution.scope.accountId || (resolution.scope.merchant !== undefined && resolution.scope.merchant !== transaction.merchant)) continue;
    if (!resolution.reason.trim() || !Number.isFinite(Date.parse(resolution.resolvedAt)) || resolution.sourceIds.length === 0) continue;
    cases.set(transaction.id, { ...review, disposition: resolution.disposition, reasons: [...review.reasons, `user resolution: ${resolution.reason.trim().slice(0, 240)}`], sourceIds: [...new Set([...review.sourceIds, ...resolution.sourceIds])].sort() });
  }
  const evaluated = [...cases.values()].sort((left, right) => left.id.localeCompare(right.id));
  const observableMissedKnownIssueCount = knownIssueTransactionIds.filter((id) => !evaluated.some((review) => review.transactionId === id)).length;
  const available = resolutions.length >= 3 || knownIssueTransactionIds.length >= 3;
  return {
    cases: evaluated,
    metrics: { resolvedCount: evaluated.filter((review) => review.disposition !== "UNRESOLVED").length, confirmedLegitimateCount: evaluated.filter((review) => review.disposition === "CONFIRMED_LEGITIMATE").length, observableMissedKnownIssueCount, available },
    limitations: [
      ...(available ? [] : ["false-positive and observable missed-known-issue metrics remain limited until at least three scoped resolutions or known issues exist"]),
      ...(evaluated.some((review) => review.priority === "URGENT_REVIEW") ? ["possible scam/coercion remains distinct from confirmed unauthorized activity and requires user review"] : [])
    ]
  };
}

export interface FinanceForecastPoint {
  month: string;
  openingCash: MoneyValue;
  expectedIncome: MoneyValue;
  expectedSpending: MoneyValue;
  expectedNet: MoneyValue;
  closingCash: MoneyValue;
}

export interface FinanceForecastVintage {
  id: string;
  createdAt: string;
  scenario: "BASE" | "DOWNSIDE" | "UPSIDE";
  points: FinanceForecastPoint[];
  assumptions: { monthlyIncome: MoneyValue; monthlySpending: MoneyValue; incomeFactor: number; spendingFactor: number };
  sourceIds: string[];
  evidence: FinanceEvidence;
}

export interface FinanceForecastInput {
  vintageId: string;
  createdAt: string;
  startMonth: string;
  openingCash: MoneyValue;
  monthlyIncome: MoneyValue;
  monthlySpending: MoneyValue;
  horizonMonths: number;
  scenario: "BASE" | "DOWNSIDE" | "UPSIDE";
  sourceIds: string[];
}

export function createFinanceForecast(input: FinanceForecastInput): FinanceForecastVintage {
  if (!input.vintageId.trim() || !input.createdAt.trim()) throw new Error("Forecast vintage identity and creation time are required");
  if (!/^\d{4}-\d{2}$/.test(input.startMonth)) throw new Error("Forecast start month must use YYYY-MM format");
  if (!Number.isInteger(input.horizonMonths) || input.horizonMonths < 1 || input.horizonMonths > 120) throw new Error("Forecast horizon is outside the supported range");
  if (input.openingCash.currency !== input.monthlyIncome.currency || input.openingCash.currency !== input.monthlySpending.currency) throw new Error("Forecast values must use one currency");
  assertNonNegativeMoney(input.openingCash, "Opening cash");
  assertNonNegativeMoney(input.monthlyIncome, "Forecast income");
  assertNonNegativeMoney(input.monthlySpending, "Forecast spending");
  const incomeFactor = input.scenario === "DOWNSIDE" ? 0.9 : input.scenario === "UPSIDE" ? 1.05 : 1;
  const spendingFactor = input.scenario === "DOWNSIDE" ? 1.1 : input.scenario === "UPSIDE" ? 0.98 : 1;
  const income = scaleMoney(input.monthlyIncome, incomeFactor);
  const spending = scaleMoney(input.monthlySpending, spendingFactor);
  let cash = input.openingCash;
  const points: FinanceForecastPoint[] = [];
  for (let index = 0; index < input.horizonMonths; index += 1) {
    const expectedNet = subtractMoney(income, spending);
    const closingCash = addMoney(cash, expectedNet);
    const month = addMonths(input.startMonth, index);
    points.push({ month, openingCash: cash, expectedIncome: income, expectedSpending: spending, expectedNet, closingCash });
    cash = closingCash;
  }
  return { id: input.vintageId, createdAt: input.createdAt, scenario: input.scenario, points, assumptions: { monthlyIncome: input.monthlyIncome, monthlySpending: input.monthlySpending, incomeFactor, spendingFactor }, sourceIds: [...new Set(input.sourceIds)].sort(), evidence: { truthClass: "FORECAST", sourceIds: [...new Set(input.sourceIds)].sort(), note: "Forecast vintage is retained when actuals arrive; it is not an adopted plan by itself." } };
}

export interface FinanceForecastError {
  month: string;
  forecastClosingCash: MoneyValue;
  actualClosingCash: MoneyValue;
  error: MoneyValue;
  sourceIds?: string[];
}

export interface FinanceForecastActual {
  month: string;
  closingCash: MoneyValue;
  sourceIds: string[];
}

export interface FinanceForecastActualizedPoint extends FinanceForecastPoint {
  forecastClosingCash: MoneyValue;
  actualClosingCash?: MoneyValue;
  actualized: boolean;
}

export interface FinanceForecastReconciliation {
  vintageId: string;
  points: FinanceForecastActualizedPoint[];
  errors: FinanceForecastError[];
  meanError: MoneyValue;
  meanAbsoluteError: MoneyValue;
  sourceIds: string[];
  limitations: string[];
  evidence: FinanceEvidence;
}

export function compareFinanceForecastToActual(vintage: FinanceForecastVintage, actuals: ReadonlyArray<{ month: string; closingCash: MoneyValue }>): FinanceForecastError[] {
  return actuals.flatMap((actual) => {
    const forecast = vintage.points.find((point) => point.month === actual.month);
    if (!forecast || forecast.closingCash.currency !== actual.closingCash.currency) return [];
    return [{ month: actual.month, forecastClosingCash: forecast.closingCash, actualClosingCash: actual.closingCash, error: subtractMoney(actual.closingCash, forecast.closingCash) }];
  });
}

/** Retain the immutable vintage while replacing only elapsed projection points in a derived view. */
export function reconcileFinanceForecast(vintage: FinanceForecastVintage, actuals: readonly FinanceForecastActual[]): FinanceForecastReconciliation {
  const actualByMonth = new Map<string, FinanceForecastActual>();
  const limitations: string[] = [];
  for (const actual of actuals) {
    if (!/^\d{4}-\d{2}$/.test(actual.month)) throw new Error("Forecast actual month must use YYYY-MM format");
    if (actual.closingCash.currency !== vintage.points[0]?.closingCash.currency) throw new Error("Forecast actuals must use the vintage currency");
    if (actualByMonth.has(actual.month)) throw new Error("Forecast actual months must be unique");
    if (actual.sourceIds.some((sourceId) => !sourceId.trim())) throw new Error("Forecast actual source identities must be non-empty");
    actualByMonth.set(actual.month, actual);
  }
  const vintageMonths = new Set(vintage.points.map((point) => point.month));
  for (const actual of actuals) if (!vintageMonths.has(actual.month)) limitations.push(`actual ${actual.month} is outside the retained forecast horizon`);
  let cash = vintage.points[0]?.openingCash;
  const points = vintage.points.map((point) => {
    const actual = actualByMonth.get(point.month);
    const openingCash = cash ?? point.openingCash;
    const actualized = Boolean(actual && actual.closingCash.currency === point.closingCash.currency);
    const closingCash = actualized ? actual!.closingCash : addMoney(openingCash, point.expectedNet);
    const result: FinanceForecastActualizedPoint = { ...point, openingCash, closingCash, forecastClosingCash: point.closingCash, actualized, ...(actualized ? { actualClosingCash: actual!.closingCash } : {}) };
    cash = closingCash;
    return result;
  });
  const errors = actuals.flatMap((actual) => {
    const forecast = vintage.points.find((point) => point.month === actual.month);
    if (!forecast || forecast.closingCash.currency !== actual.closingCash.currency) return [];
    return [{ month: actual.month, forecastClosingCash: forecast.closingCash, actualClosingCash: actual.closingCash, error: subtractMoney(actual.closingCash, forecast.closingCash), sourceIds: [...new Set(actual.sourceIds)].sort() }];
  }).sort((left, right) => left.month.localeCompare(right.month));
  let totalError = 0n;
  let totalAbsoluteError = 0n;
  for (const error of errors) {
    const value = BigInt(error.error.amountMinor);
    totalError += value;
    totalAbsoluteError += value < 0n ? -value : value;
  }
  const currency = vintage.points[0]?.closingCash.currency ?? vintage.assumptions.monthlyIncome.currency;
  const divisor = BigInt(errors.length || 1);
  const sourceIds = [...new Set([...vintage.sourceIds, ...actuals.flatMap((actual) => actual.sourceIds)])].sort();
  return {
    vintageId: vintage.id,
    points,
    errors,
    meanError: moneyFromMinor(errors.length > 0 ? totalError / divisor : 0n, currency),
    meanAbsoluteError: moneyFromMinor(errors.length > 0 ? totalAbsoluteError / divisor : 0n, currency),
    sourceIds,
    limitations: [...new Set(limitations)].sort(),
    evidence: { truthClass: "DERIVED", sourceIds, note: "Actualized forecast view retains the original forecast vintage and uses supplied actual observations only for elapsed points." }
  };
}

export interface FinanceDataQualityInput {
  requiredPeriods: string[];
  availablePeriods: string[];
  requiredSourceIds?: readonly string[];
  availableSourceIds?: readonly string[];
  requiredSourceClasses?: readonly FinanceSourceClass[];
  availableSourceClasses?: readonly FinanceSourceClass[];
  staleSources?: string[];
  unresolvedReconciliations?: number;
  unresolvedReviewCases?: number;
}

export interface FinanceDataQuality {
  status: "SUFFICIENT" | "LIMITED" | "UNKNOWN";
  missingPeriods: string[];
  missingSourceIds: string[];
  missingSourceClasses: FinanceSourceClass[];
  staleSources: string[];
  unresolvedReconciliations: number;
  unresolvedReviewCases: number;
  limitations: string[];
}

export function assessFinanceDataQuality(input: FinanceDataQualityInput): FinanceDataQuality {
  const available = new Set(input.availablePeriods);
  const missingPeriods = [...new Set(input.requiredPeriods)].filter((period) => !available.has(period)).sort();
  const availableSourceIds = new Set((input.availableSourceIds ?? []).filter((sourceId) => sourceId.trim()));
  const missingSourceIds = [...new Set((input.requiredSourceIds ?? []).filter((sourceId) => sourceId.trim()))].filter((sourceId) => !availableSourceIds.has(sourceId)).sort();
  const availableSourceClasses = new Set(input.availableSourceClasses ?? []);
  const missingSourceClasses = [...new Set(input.requiredSourceClasses ?? [])].filter((sourceClass) => !availableSourceClasses.has(sourceClass)).sort();
  const staleSources = [...new Set(input.staleSources ?? [])].sort();
  const unresolvedReconciliations = Math.max(0, input.unresolvedReconciliations ?? 0);
  const unresolvedReviewCases = Math.max(0, input.unresolvedReviewCases ?? 0);
  const limitations = [
    ...(missingPeriods.length > 0 ? [`missing periods: ${missingPeriods.join(", ")}`] : []),
    ...(missingSourceIds.length > 0 ? [`missing sources: ${missingSourceIds.join(", ")}`] : []),
    ...(missingSourceClasses.length > 0 ? [`missing source classes: ${missingSourceClasses.join(", ")}`] : []),
    ...(staleSources.length > 0 ? [`stale sources: ${staleSources.join(", ")}`] : []),
    ...(unresolvedReconciliations > 0 ? [`${unresolvedReconciliations} unresolved reconciliation(s)`] : []),
    ...(unresolvedReviewCases > 0 ? [`${unresolvedReviewCases} unresolved review case(s)`] : [])
  ];
  return { status: limitations.length === 0 ? "SUFFICIENT" : missingPeriods.length > 0 || missingSourceIds.length > 0 || missingSourceClasses.length > 0 || staleSources.length > 0 ? "UNKNOWN" : "LIMITED", missingPeriods, missingSourceIds, missingSourceClasses, staleSources, unresolvedReconciliations, unresolvedReviewCases, limitations };
}

function normalizeFinanceHeader(value: string): string {
  return value.replace(/^\uFEFF/u, "").toLocaleLowerCase("en-CA").replace(/[^a-z0-9]/gu, "");
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

function medianBigInt(values: readonly bigint[]): bigint {
  const sorted = [...values].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  if (sorted.length === 0) return 0n;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2n : sorted[middle]!;
}

function absoluteMoneyMinor(value: string): bigint {
  const minor = BigInt(value);
  return minor < 0n ? -minor : minor;
}

function createFinanceReviewBaseline(transactions: readonly FinanceTransaction[], scope: FinanceReviewBaseline["scope"], currency: string): FinanceReviewBaseline | undefined {
  const amounts = transactions.filter((transaction) => transaction.amount.currency === currency).map((transaction) => absoluteMoneyMinor(transaction.amount.amountMinor));
  if (amounts.length === 0) return undefined;
  const center = medianBigInt(amounts);
  const deviations = amounts.map((amount) => amount > center ? amount - center : center - amount);
  const deviation = medianBigInt(deviations);
  const spread = deviation > 0n ? deviation * 3n : center * 3n;
  const upperBound = center + (spread > 0n ? spread : 1n);
  return {
    scope,
    sampleCount: amounts.length,
    medianAmount: moneyFromMinor(center, currency),
    medianAbsoluteDeviation: moneyFromMinor(deviation, currency),
    upperBound: moneyFromMinor(upperBound, currency),
    historyStrength: amounts.length >= 6 ? "STRONG" : amounts.length >= 3 ? "MODERATE" : "WEAK"
  };
}

function scaleMoney(value: MoneyValue, factor: number): MoneyValue {
  if (!Number.isFinite(factor) || factor < 0 || factor > 10) throw new Error("Money scaling factor is invalid");
  const minor = BigInt(Math.round(Number(value.amountMinor) * factor));
  return moneyFromMinor(minor, value.currency);
}

function addMonths(startMonth: string, offset: number): string {
  const [yearText, monthText] = startMonth.split("-");
  const month = Number(monthText) - 1 + offset;
  const date = new Date(Date.UTC(Number(yearText), month, 1));
  return `${date.getUTCFullYear().toString().padStart(4, "0")}-${(date.getUTCMonth() + 1).toString().padStart(2, "0")}`;
}

function financeModelKey(value: string): string {
  let hash = 14695981039346656037n;
  for (const character of value) hash = BigInt.asUintN(64, (hash ^ BigInt(character.charCodeAt(0))) * 1099511628211n);
  return hash.toString(16).padStart(16, "0");
}

export interface FinanceRollingEssentialSpending {
  currency: string;
  windowMonths: number;
  observedPeriods: string[];
  monthlyEssentialSpending: MoneyValue;
  sourceIds: string[];
  evidence: FinanceEvidence;
}

/** Compute a trailing observed-period average without treating missing months as zero. */
export function calculateFinanceRollingEssentialSpending(transactions: readonly FinanceTransaction[], currency: string, windowMonths: number): FinanceRollingEssentialSpending | undefined {
  if (!Number.isInteger(windowMonths) || windowMonths < 1 || windowMonths > 120) throw new Error("Rolling essential-month window is outside the supported range");
  const normalizedCurrency = parseMoney("0", currency).currency;
  const byPeriod = new Map<string, { totalMinor: bigint; sourceIds: string[]; transactionIds: string[] }>();
  for (const transaction of transactions) {
    if (!transaction.essential || (transaction.status !== "POSTED" && transaction.status !== "CORRECTED") || transaction.direction !== "OUTFLOW" || transaction.amount.currency !== normalizedCurrency) continue;
    const period = transaction.postedAt.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(period)) continue;
    const current = byPeriod.get(period) ?? { totalMinor: 0n, sourceIds: [], transactionIds: [] };
    current.totalMinor += absoluteMoneyMinor(transaction.amount.amountMinor);
    current.sourceIds.push(transaction.lineage.sourceId);
    current.transactionIds.push(transaction.id);
    byPeriod.set(period, current);
  }
  const observedPeriods = [...byPeriod.keys()].sort().slice(-windowMonths);
  if (observedPeriods.length === 0) return undefined;
  const totalMinor = observedPeriods.reduce((total, period) => total + byPeriod.get(period)!.totalMinor, 0n);
  const sourceIds = [...new Set(observedPeriods.flatMap((period) => byPeriod.get(period)!.sourceIds))].sort();
  const transactionIds = observedPeriods.flatMap((period) => byPeriod.get(period)!.transactionIds);
  return { currency: normalizedCurrency, windowMonths, observedPeriods, monthlyEssentialSpending: moneyFromMinor(totalMinor / BigInt(observedPeriods.length), normalizedCurrency), sourceIds, evidence: { truthClass: "OBSERVED", sourceIds: [...new Set(transactionIds)].sort(), note: "Trailing average uses observed essential-spending periods only; absent periods are not coerced to zero." } };
}

export interface FinanceGoalPlan {
  goalId: string;
  target: MoneyValue;
  funded: MoneyValue;
  remaining: MoneyValue;
  requiredMonthlyContribution?: MoneyValue;
  sustainableMonthlySurplus?: MoneyValue;
  fundingConflict: boolean;
  truthClass: "MODELED";
}

export type FinanceGoalTarget = MoneyValue | { kind: "ROLLING_ESSENTIAL_MONTHS"; months: number; monthlyEssentialSpending: MoneyValue };

export interface FinanceGoalInput {
  goalId: string;
  target: FinanceGoalTarget;
  funded: MoneyValue;
  targetDate?: string;
  sustainableMonthlySurplus?: MoneyValue;
}

export function projectFinanceGoal(input: FinanceGoalInput, now = new Date()): FinanceGoalPlan {
  const target = resolveGoalTarget(input.target);
  if (input.funded.currency !== target.currency) throw new Error("Goal funding currency does not match target");
  assertNonNegativeMoney(input.funded, "Goal funding");
  const remaining = positiveDifference(target, input.funded);
  const months = input.targetDate ? monthsUntil(now, input.targetDate) : undefined;
  const requiredMonthlyContribution = months === undefined ? undefined : moneyFromMinor(ceilDivide(BigInt(remaining.amountMinor), BigInt(Math.max(months, 1))), target.currency);
  const sustainable = input.sustainableMonthlySurplus;
  if (sustainable && sustainable.currency !== target.currency) throw new Error("Goal surplus currency does not match target");
  const fundingConflict = sustainable !== undefined && requiredMonthlyContribution !== undefined && BigInt(requiredMonthlyContribution.amountMinor) > BigInt(sustainable.amountMinor);
  return { goalId: input.goalId, target, funded: input.funded, remaining, ...(requiredMonthlyContribution ? { requiredMonthlyContribution } : {}), ...(sustainable ? { sustainableMonthlySurplus: sustainable } : {}), fundingConflict, truthClass: "MODELED" };
}

export interface FinanceFundingRequest {
  goalId: string;
  requiredMonthlyContribution: MoneyValue;
  hardConstraint?: boolean;
}

export interface FinanceFundingAlternative {
  id: string;
  label: string;
  monthlyContributions: Record<string, MoneyValue>;
  totalMonthlyContribution: MoneyValue;
  shortfallByGoal: Record<string, MoneyValue>;
  preservesHardConstraints: boolean;
  truthClass: "MODELED";
}

export interface FinanceFundingAnalysis {
  currency: string;
  requestedMonthlyContribution: MoneyValue;
  sustainableMonthlySurplus: MoneyValue;
  aggregateShortfall: MoneyValue;
  fundingConflict: boolean;
  hardConstraintConflict: boolean;
  alternatives: FinanceFundingAlternative[];
}

/**
 * Produce transparent review-only funding plans. Hard constraints are fully
 * funded when mathematically possible; soft-goal tradeoffs are explicit and
 * deterministic. No priority score or canonical allocation is changed.
 */
export function planFinanceAllocationAlternatives(requests: readonly FinanceFundingRequest[], sustainableMonthlySurplus: MoneyValue): FinanceFundingAnalysis {
  const currency = parseMoney("0", sustainableMonthlySurplus.currency).currency;
  assertNonNegativeMoney(sustainableMonthlySurplus, "Sustainable monthly surplus");
  const sustainable = moneyFromMinor(BigInt(sustainableMonthlySurplus.amountMinor), currency);
  const seen = new Set<string>();
  const normalized = requests.slice().sort((left, right) => left.goalId.localeCompare(right.goalId)).map((request) => {
    const goalId = request.goalId.trim();
    if (!goalId || seen.has(goalId)) throw new Error("Funding request goal IDs must be unique and non-empty");
    seen.add(goalId);
    if (request.requiredMonthlyContribution.currency !== currency) throw new Error("Funding requests must use the surplus currency");
    assertNonNegativeMoney(request.requiredMonthlyContribution, "Required monthly contribution");
    return { ...request, goalId, hardConstraint: request.hardConstraint === true };
  });
  const requested = normalized.reduce((total, request) => addMoney(total, request.requiredMonthlyContribution), parseMoney("0", currency));
  const hard = normalized.filter((request) => request.hardConstraint);
  const soft = normalized.filter((request) => !request.hardConstraint);
  const hardTotal = hard.reduce((total, request) => addMoney(total, request.requiredMonthlyContribution), parseMoney("0", currency));
  const fundingConflict = BigInt(requested.amountMinor) > BigInt(sustainable.amountMinor);
  const hardConstraintConflict = BigInt(hardTotal.amountMinor) > BigInt(sustainable.amountMinor);
  const aggregateShortfall = positiveDifference(requested, sustainable);
  if (!fundingConflict || hardConstraintConflict || soft.length === 0) return { currency, requestedMonthlyContribution: requested, sustainableMonthlySurplus: sustainable, aggregateShortfall, fundingConflict, hardConstraintConflict, alternatives: [] };
  const capacityForSoft = subtractMoney(sustainable, hardTotal);
  const proportional = allocateSoftProportionally(soft, capacityForSoft);
  const deferred = Object.fromEntries(soft.map((request) => [request.goalId, parseMoney("0", currency)]));
  const alternatives = [
    buildFundingAlternative("PROPORTIONAL_SOFT_GOALS", "Preserve hard constraints; share remaining surplus proportionally.", hard, soft, proportional, sustainable),
    buildFundingAlternative("DEFER_SOFT_GOALS", "Preserve hard constraints; defer soft-goal contributions for explicit review.", hard, soft, deferred, sustainable)
  ];
  return { currency, requestedMonthlyContribution: requested, sustainableMonthlySurplus: sustainable, aggregateShortfall, fundingConflict, hardConstraintConflict, alternatives: deduplicateFundingAlternatives(alternatives) };
}

function allocateSoftProportionally(requests: readonly FinanceFundingRequest[], capacity: MoneyValue): Record<string, MoneyValue> {
  const total = requests.reduce((sum, request) => addMoney(sum, request.requiredMonthlyContribution), parseMoney("0", capacity.currency));
  const capacityMinor = BigInt(capacity.amountMinor);
  const totalMinor = BigInt(total.amountMinor);
  const allocations: Record<string, MoneyValue> = {};
  let allocated = 0n;
  for (const request of requests) {
    const amount = totalMinor === 0n ? 0n : (capacityMinor * BigInt(request.requiredMonthlyContribution.amountMinor)) / totalMinor;
    allocations[request.goalId] = moneyFromMinor(amount, capacity.currency);
    allocated += amount;
  }
  let remainder = capacityMinor - allocated;
  for (const request of requests) {
    if (remainder <= 0n) break;
    const current = BigInt(allocations[request.goalId]!.amountMinor);
    const maximum = BigInt(request.requiredMonthlyContribution.amountMinor);
    if (current < maximum) {
      allocations[request.goalId] = moneyFromMinor(current + 1n, capacity.currency);
      remainder -= 1n;
    }
  }
  return allocations;
}

function buildFundingAlternative(id: string, label: string, hard: readonly FinanceFundingRequest[], soft: readonly FinanceFundingRequest[], softAllocations: Record<string, MoneyValue>, sustainable: MoneyValue): FinanceFundingAlternative {
  const monthlyContributions: Record<string, MoneyValue> = {};
  for (const request of hard) monthlyContributions[request.goalId] = request.requiredMonthlyContribution;
  for (const request of soft) monthlyContributions[request.goalId] = softAllocations[request.goalId] ?? parseMoney("0", sustainable.currency);
  const total = Object.values(monthlyContributions).reduce((sum, amount) => addMoney(sum, amount), parseMoney("0", sustainable.currency));
  const shortfallByGoal: Record<string, MoneyValue> = {};
  for (const request of [...hard, ...soft]) {
    const shortfall = positiveDifference(request.requiredMonthlyContribution, monthlyContributions[request.goalId]!);
    if (BigInt(shortfall.amountMinor) > 0n) shortfallByGoal[request.goalId] = shortfall;
  }
  return { id, label, monthlyContributions, totalMonthlyContribution: total, shortfallByGoal, preservesHardConstraints: hard.every((request) => monthlyContributions[request.goalId]?.amountMinor === request.requiredMonthlyContribution.amountMinor), truthClass: "MODELED" };
}

function deduplicateFundingAlternatives(alternatives: readonly FinanceFundingAlternative[]): FinanceFundingAlternative[] {
  const seen = new Set<string>();
  return alternatives.filter((alternative) => {
    const key = JSON.stringify(Object.entries(alternative.monthlyContributions).sort(([left], [right]) => left.localeCompare(right)));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface FireScenarioInput {
  scenarioId: string;
  retirementDate?: string;
  currency: string;
  currentInvestments: MoneyValue;
  annualContribution: MoneyValue;
  annualSpending: MoneyValue;
  yearsToRetirement: number;
  yearsInRetirement: number;
  nominalReturnRate: number;
  inflationRate: number;
  annualFeesRate: number;
  effectiveTaxRate: number;
  withdrawalRate: number;
  downsideFirstReturns?: number[];
  upsideFirstReturns?: number[];
}

export interface FireScenarioProjection {
  scenarioId: string;
  retirementDate?: string;
  currency: string;
  nominalAtRetirement: number;
  realAtRetirement: number;
  afterTaxNominalAtRetirement: number;
  deterministicRetirementEnd: number;
  downsideSequenceEnd: number;
  upsideSequenceEnd: number;
  assumptions: Record<string, number>;
  truthClass: "MODELED";
  limitations: string[];
}

/**
 * Bounded retirement/FIRE projection. It exposes sequence sensitivity and
 * keeps all inputs as assumptions/model outputs; it is not advice or a claim
 * about future returns, taxes, longevity, or suitability.
 */
export function projectFireScenario(input: FireScenarioInput): FireScenarioProjection {
  if (!input.scenarioId.trim()) throw new Error("A FIRE scenario ID is required");
  const currency = parseMoney("0", input.currency).currency;
  for (const money of [input.currentInvestments, input.annualContribution, input.annualSpending]) if (money.currency !== currency) throw new Error("FIRE inputs must use one currency");
  if (![input.yearsToRetirement, input.yearsInRetirement].every((value) => Number.isInteger(value) && value >= 0 && value <= 120)) throw new Error("FIRE horizon is outside the supported range");
  for (const rate of [input.nominalReturnRate, input.inflationRate, input.annualFeesRate, input.effectiveTaxRate, input.withdrawalRate]) if (!Number.isFinite(rate) || rate < 0 || rate > 1) throw new Error("FIRE assumptions must be rates between 0 and 1");
  const starting = Number(input.currentInvestments.amountMinor) / 100;
  const contribution = Number(input.annualContribution.amountMinor) / 100;
  const spending = Number(input.annualSpending.amountMinor) / 100;
  if (![starting, contribution, spending].every((value) => Number.isSafeInteger(value * 100))) throw new Error("FIRE money values exceed the safe projection range");
  const netReturn = 1 + input.nominalReturnRate - input.annualFeesRate;
  let nominalAtRetirement = starting;
  for (let year = 0; year < input.yearsToRetirement; year += 1) nominalAtRetirement = nominalAtRetirement * netReturn + contribution;
  const realAtRetirement = nominalAtRetirement / Math.pow(1 + input.inflationRate, input.yearsToRetirement);
  const afterTaxNominalAtRetirement = nominalAtRetirement * (1 - input.effectiveTaxRate);
  const deterministicRetirementEnd = runRetirementPath(nominalAtRetirement, input.yearsInRetirement, input.nominalReturnRate, input.annualFeesRate, spending, input.inflationRate, input.withdrawalRate, undefined);
  const downsideSequenceEnd = runRetirementPath(nominalAtRetirement, input.yearsInRetirement, input.nominalReturnRate, input.annualFeesRate, spending, input.inflationRate, input.withdrawalRate, input.downsideFirstReturns);
  const upsideSequenceEnd = runRetirementPath(nominalAtRetirement, input.yearsInRetirement, input.nominalReturnRate, input.annualFeesRate, spending, input.inflationRate, input.withdrawalRate, input.upsideFirstReturns);
  return { scenarioId: input.scenarioId, ...(input.retirementDate ? { retirementDate: input.retirementDate } : {}), currency, nominalAtRetirement, realAtRetirement, afterTaxNominalAtRetirement, deterministicRetirementEnd, downsideSequenceEnd, upsideSequenceEnd, assumptions: { yearsToRetirement: input.yearsToRetirement, yearsInRetirement: input.yearsInRetirement, nominalReturnRate: input.nominalReturnRate, inflationRate: input.inflationRate, annualFeesRate: input.annualFeesRate, effectiveTaxRate: input.effectiveTaxRate, withdrawalRate: input.withdrawalRate }, truthClass: "MODELED", limitations: ["Projection is assumption-driven and does not establish investment, tax, legal, insurance, or retirement suitability.", "Sequence and longevity sensitivity are represented only by the supplied bounded paths and horizon."] };
}

function runRetirementPath(starting: number, years: number, nominalReturnRate: number, feesRate: number, annualSpending: number, inflationRate: number, withdrawalRate: number, firstReturns?: number[]): number {
  let balance = starting;
  for (let year = 0; year < years; year += 1) {
    const returnRate = firstReturns?.[year] ?? nominalReturnRate;
    balance = Math.max(0, balance * (1 + returnRate - feesRate) - annualSpending * Math.pow(1 + inflationRate, year) * (1 + withdrawalRate));
  }
  return balance;
}

function resolveGoalTarget(target: FinanceGoalTarget): MoneyValue {
  if ("kind" in target) {
    if (!Number.isInteger(target.months) || target.months < 1 || target.months > 120) throw new Error("Dynamic goal months are outside the supported range");
    if (target.monthlyEssentialSpending.amountMinor.startsWith("-")) throw new Error("Dynamic goal spending cannot be negative");
    return moneyFromMinor(BigInt(target.monthlyEssentialSpending.amountMinor) * BigInt(target.months), target.monthlyEssentialSpending.currency);
  }
  assertNonNegativeMoney(target, "Goal target");
  return target;
}

function positiveDifference(left: MoneyValue, right: MoneyValue): MoneyValue {
  const difference = subtractMoney(left, right);
  return BigInt(difference.amountMinor) > 0n ? difference : parseMoney("0", left.currency);
}

function assertNonNegativeMoney(value: MoneyValue, label: string): void {
  if (!/^-?\d+$/.test(value.amountMinor) || BigInt(value.amountMinor) < 0n) throw new Error(`${label} must be a non-negative exact-money value`);
  parseMoney("0", value.currency);
}

function moneyFromMinor(amountMinor: bigint, currency: string): MoneyValue {
  if (amountMinor < 0n || amountMinor > 2n ** 63n - 1n) throw new Error("Money amount is outside the supported range");
  return { amountMinor: amountMinor.toString(), currency: parseMoney("0", currency).currency };
}

function ceilDivide(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("Division denominator must be positive");
  return (numerator + denominator - 1n) / denominator;
}

function monthsUntil(now: Date, targetDate: string): number {
  const target = new Date(targetDate);
  if (!Number.isFinite(target.getTime())) throw new Error("Goal target date is invalid");
  const months = (target.getUTCFullYear() - now.getUTCFullYear()) * 12 + target.getUTCMonth() - now.getUTCMonth();
  return Math.max(0, months);
}
