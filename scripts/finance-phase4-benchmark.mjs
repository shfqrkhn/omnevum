import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceFiles = [
  "src/core/dependency-graph.ts",
  "src/core/finance-model.ts",
  "src/core/finance-projection.ts",
  "src/core/finance.ts",
  "src/core/model.ts",
  "src/core/money.ts"
].sort();
const coveredRows = Array.from({ length: 13 }, (_, index) => `OMN-ACC-${159 + index}`);
const limitations = [
  "Synthetic source-contract coverage only; this is not human acceptance, release, suitability, or performance evidence.",
  "No network, credentials, external effects, UI, live statements, or real financial decisions are exercised.",
  "Finance and FIRE values remain modeled, assumption-driven, and review-only; authentication or familiarity is not proof of legitimacy."
];

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const read = (path) => readFileSync(join(root, path));

function currentIdentity() {
  const git = process.platform === "win32" ? "git.exe" : "git";
  const head = execFileSync(git, ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const sourceHashInput = sourceFiles.map((path) => `${path}\0${read(path).toString("utf8")}`).join("\0");
  return {
    head,
    sourceSha256: sha256(sourceHashInput),
    sourceFiles,
    sourceHashDefinition: "SHA-256 of sorted relative source paths and exact current UTF-8 bytes."
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function money(amountMinor, currency = "CAD") {
  return { amountMinor: String(amountMinor), currency };
}

const FIXTURE_TIME = "2026-09-20T00:00:00.000Z";

function record(id, data, overrides = {}) {
  return {
    id,
    recordType: "observation",
    owner: "domain.finance",
    schemaVersion: 1,
    createdAt: FIXTURE_TIME,
    modifiedAt: FIXTURE_TIME,
    provenance: { source: "USER_INPUT", capturedAt: FIXTURE_TIME, sourceId: id },
    truthClass: "USER_OBSERVATION",
    sensitivity: "PRIVATE",
    revision: 1,
    deleted: false,
    data,
    ...overrides
  };
}

function dependencyLink(id, sourceId, targetId, edgeKind, extra = {}) {
  return record(id, {
    kind: "dependency-link",
    version: 1,
    sourceId,
    targetId,
    edgeKind,
    status: "ACTIVE",
    label: `${edgeKind.toLowerCase()} fixture link`,
    text: `${sourceId} -> ${targetId}: ${edgeKind.toLowerCase()} fixture link`,
    ...extra
  }, { recordType: "relationship", owner: "platform.dependency", sensitivity: "SHARED" });
}

function transaction(id, amountMinor, merchant, description, accountId, postedAt, sourceId = `source:${id}`, extra = {}) {
  return record(id, {
    kind: "finance-transaction",
    merchant,
    description,
    amountMinor: String(amountMinor),
    currency: "CAD",
    accountId,
    postedAt,
    status: "POSTED",
    naturalKey: `fixture:${id}`,
    financeLineage: { sourceId, sourceSha256: "f".repeat(64), sourceRow: 1, parserProfile: "STRUCTURED_V1", rawFields: {} },
    ...extra
  }, {
    owner: "domain.finance",
    truthClass: "IMPORTED_RECORD",
    provenance: { source: "IMPORT", capturedAt: FIXTURE_TIME, sourceId }
  });
}

function buildRecords() {
  const resource = record("resource-surplus", { kind: "finance-resource", label: "Shared monthly surplus", text: "One canonical surplus", amountMinor: "180000", currency: "CAD" });
  const goals = [
    ["goal-emergency", "Emergency reserve", "100000"],
    ["goal-retirement", "Retirement", "100000"],
    ["goal-fire", "FIRE", "100000"],
    ["goal-home", "Home", "80000"],
    ["goal-vacation", "Vacation", "60000"]
  ].map(([id, label, targetAmountMinor]) => record(id, { kind: "finance-goal", label, text: label, targetAmountMinor, currency: "CAD" }, { owner: "core.capture", recordType: "note" }));
  const allocations = [
    ["allocation-emergency", "goal-emergency", "50000"],
    ["allocation-retirement", "goal-retirement", "40000"],
    ["allocation-fire", "goal-fire", "30000"],
    ["allocation-home", "goal-home", "20000"],
    ["allocation-vacation", "goal-vacation", "10000"]
  ].map(([id, targetId, amountMinor]) => dependencyLink(id, resource.id, targetId, "ALLOCATION", { allocationMode: "EXCLUSIVE", allocation: money(amountMinor) }));

  const travel = record("travel-authorized", { kind: "travel-plan", label: "Synthetic vacation", itinerary: "fixture only", financeProjection: { authorized: true, estimatedCostMinor: "120000", currency: "CAD", dueDate: "2027-06-15", label: "Authorized vacation projection" } }, { owner: "domain.travel" });
  const compensation = record("work-compensation", { kind: "compensation-change", title: "Synthetic promotion", financeProjection: { authorized: true, monthlyAmountMinor: "500000", currency: "CAD", effectiveDate: "2026-10-01", label: "Authorized monthly compensation" } }, { owner: "domain.work", truthClass: "IMPORTED_RECORD", provenance: { source: "IMPORT", capturedAt: FIXTURE_TIME, sourceId: "source:pay-statement" } });
  const ignoredTravel = record("travel-private-unprojected", { kind: "travel-plan", label: "Private unprojected trip", estimatedCostMinor: "999999", currency: "CAD", dueDate: "2027-07-01" }, { owner: "domain.travel" });

  const statementFacts = record("investment-facts", {
    kind: "finance-statement-facts",
    sourceId: "source:investment-statement",
    sourceClass: "INVESTMENT",
    statementFacts: {
      sourceId: "source:investment-statement",
      sourceClass: "INVESTMENT",
      investment: { valuation: money("2500000"), valuationDate: "2026-09-01T00:00:00.000Z", externalCashFlows: [] },
      evidence: { truthClass: "OBSERVED", sourceIds: ["source:investment-statement"] },
      limitations: []
    }
  }, { truthClass: "IMPORTED_RECORD", provenance: { source: "IMPORT", capturedAt: FIXTURE_TIME, sourceId: "source:investment-statement" } });
  const fireBase = record("fire-base", {
    kind: "finance-fire", scenarioId: "fire-base", currency: "CAD", annualContributionMinor: "120000", annualSpendingMinor: "60000", retirementDate: "2031-09-20", yearsToRetirement: 5, yearsInRetirement: 10,
    nominalReturnRate: 0.05, inflationRate: 0.02, annualFeesRate: 0.01, effectiveTaxRate: 0.2, withdrawalRate: 0,
    downsideFirstReturns: [-0.2, -0.1, 0.02], upsideFirstReturns: [0.15, 0.1, 0.05]
  }, { truthClass: "ASSUMPTION" });
  const fireDownside = record("fire-downside", { ...fireBase.data, scenarioId: "fire-downside", nominalReturnRate: 0.03 }, { truthClass: "ASSUMPTION" });

  const transactions = [
    transaction("salary-jan", "500000", "synthetic payroll", "Salary", "checking", "2026-01-02T00:00:00.000Z", "source:monthly-statements"),
    transaction("salary-feb", "500000", "synthetic payroll", "Salary", "checking", "2026-02-02T00:00:00.000Z", "source:monthly-statements"),
    transaction("transfer-out", "-25000", "transfer to savings", "Transfer to savings", "checking", "2026-02-05T00:00:00.000Z", "source:checking"),
    transaction("transfer-in", "25000", "transfer from checking", "Transfer from checking", "savings", "2026-02-06T00:00:00.000Z", "source:savings"),
    transaction("unmatched-transfer", "-5000", "transfer to brokerage", "Transfer to brokerage", "checking", "2026-02-07T00:00:00.000Z", "source:checking"),
    transaction("familiar-prior", "-1000", "familiar grocer", "Groceries", "checking", "2026-02-08T00:00:00.000Z", "source:checking"),
    transaction("familiar-high-impact", "-20000", "familiar grocer", "Groceries", "checking", "2026-02-09T00:00:00.000Z", "source:checking"),
    transaction("scam-induced-transfer", "-150000", "synthetic wire service", "User-initiated transfer", "checking", "2026-02-10T00:00:00.000Z", "source:checking"),
    transaction("benign-anomaly", "-450", "synthetic annual vendor", "Annual renewal", "checking", "2026-02-11T00:00:00.000Z", "source:checking")
  ];

  const derivedBrief = record("derived-finance-brief", { kind: "finance-brief", text: "Derived fixture projection" }, { owner: "platform.analyze", truthClass: "DERIVED", sensitivity: "SHARED" });
  const privateTarget = record("private-outside-scope", { kind: "note", text: "Not authorized for this benchmark projection" }, { owner: "core.capture" });
  const derivedLink = dependencyLink("dependency-derived-brief", resource.id, derivedBrief.id, "DEPENDENCY");
  const privateLink = dependencyLink("dependency-private-outside", resource.id, privateTarget.id, "DEPENDENCY");

  return [resource, ...goals, ...allocations, travel, compensation, ignoredTravel, statementFacts, fireBase, fireDownside, ...transactions, derivedBrief, privateTarget, derivedLink, privateLink];
}

function buildDiscoveryRecords() {
  const source = record("discover-source", { kind: "note", text: "source", dependsOn: ["discover-target"], possibleRelatedIds: ["discover-ambiguous", "discover-private"] }, { owner: "core.capture" });
  const target = record("discover-target", { kind: "note", text: "target" }, { owner: "core.capture" });
  const ambiguous = record("discover-ambiguous", { kind: "note", text: "ambiguous" }, { owner: "core.capture" });
  const privateRecord = record("discover-private", { kind: "note", text: "excluded" }, { owner: "core.capture", sensitivity: "PRIVATE" });
  return { records: [source, target, ambiguous, privateRecord], authorizedIds: [source.id, target.id, ambiguous.id] };
}

async function loadApis() {
  const vite = await createServer({ root, appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  try {
    const [financeModel, financeProjection, dependencyGraph] = await Promise.all([
      vite.ssrLoadModule("/src/core/finance-model.ts"),
      vite.ssrLoadModule("/src/core/finance-projection.ts"),
      vite.ssrLoadModule("/src/core/dependency-graph.ts")
    ]);
    return { financeModel, financeProjection, dependencyGraph };
  } finally {
    await vite.close();
  }
}

async function runBenchmark() {
  const current = currentIdentity();
  const metrics = {};
  const { financeModel, financeProjection, dependencyGraph } = await loadApis();
  const {
    allocateFinanceResource, analyzeFinanceGraph, compareFinanceForecastToActual, createFinanceForecast, evaluateFinanceFeedbackLoop,
    evaluateFinanceReviewCases, matchFinanceTransfers, planFinanceAllocationAlternatives, propagateFinanceGraph, projectFireScenario
  } = financeModel;
  const { projectFinanceState, toFinanceTransaction } = financeProjection;
  const { analyzeDependencyGraph, discoverDependencyLinks, projectAuthorizedDependencyImpact, projectDependencyGraph } = dependencyGraph;
  const records = buildRecords();
  const resource = records.find((candidate) => candidate.id === "resource-surplus");
  assert(resource, "missing shared resource fixture");

  const projection = projectFinanceState(records, {
    currency: "CAD",
    asOfDate: "2026-09-20",
    requiredPeriods: ["2026-01", "2026-02"],
    changedIds: [resource.id]
  });
  const allocationResult = projection.financeAllocationResults.find((entry) => entry.resourceId === resource.id)?.result;
  assert(allocationResult, "Finance projection did not produce the shared resource allocation result");
  assert(allocationResult.overAllocated.amountMinor === "0", "exclusive allocations over-allocated the canonical resource");
  assert(allocationResult.exclusiveAllocated.amountMinor === "150000", "shared resource allocations changed unexpectedly");
  assert(Object.keys(allocationResult.byGoal).length === 5, "each shared goal did not receive one typed allocation projection");
  metrics.sharedResourceExclusiveAllocatedMinor = allocationResult.exclusiveAllocated.amountMinor;
  metrics.sharedResourceUnallocatedMinor = allocationResult.unallocated.amountMinor;
  metrics.sharedGoalsProjected = Object.keys(allocationResult.byGoal).length;

  assert(projection.crossDomain.travelPlans.length === 1, "unauthorized or malformed Travel data entered Finance");
  assert(projection.crossDomain.compensationChanges.length === 1, "authorized Work compensation was not projected");
  assert(projection.crossDomain.cashFlowByMonth["2027-06:CAD"]?.amountMinor === "-120000", "authorized Travel cash-flow projection is incorrect");
  assert(projection.crossDomain.cashFlowByMonth["2026-10:CAD"]?.amountMinor === "500000", "authorized compensation cash-flow projection is incorrect");
  assert(records.find((candidate) => candidate.id === "travel-authorized")?.owner === "domain.travel", "Travel ownership changed");
  assert(records.find((candidate) => candidate.id === "work-compensation")?.owner === "domain.work", "Work ownership changed");
  metrics.authorizedTravelProjections = projection.crossDomain.travelPlans.length;
  metrics.authorizedCompensationProjections = projection.crossDomain.compensationChanges.length;

  assert(projection.fireScenarios.length === 2, "FIRE scenario comparison did not retain both synthetic scenarios");
  assert(projection.fireScenarios.every((scenario) => scenario.projection.truthClass === "MODELED"), "FIRE output lost modeled truth classification");
  assert(projection.fireScenarios[0]?.inputEvidence.currentInvestments.truthClass === "OBSERVED", "FIRE did not preserve observed investment evidence");
  assert(projection.fireScenarios[0]?.projection.nominalAtRetirement !== projection.fireScenarios[1]?.projection.nominalAtRetirement, "FIRE scenarios did not produce distinct comparison outputs");
  metrics.fireScenariosCompared = projection.fireScenarios.length;
  metrics.fireNominalComparisonDelta = Math.abs((projection.fireScenarios[0]?.projection.nominalAtRetirement ?? 0) - (projection.fireScenarios[1]?.projection.nominalAtRetirement ?? 0));

  const hardAlternatives = planFinanceAllocationAlternatives([
    { goalId: "hard-reserve", requiredMonthlyContribution: money("60000"), hardConstraint: true },
    { goalId: "soft-home", requiredMonthlyContribution: money("50000") },
    { goalId: "soft-travel", requiredMonthlyContribution: money("50000") }
  ], money("100000"));
  assert(hardAlternatives.fundingConflict && !hardAlternatives.hardConstraintConflict, "hard-constraint conflict was not bounded correctly");
  assert(hardAlternatives.alternatives.length === 2, "bounded hard-constraint alternatives are incomplete");
  assert(hardAlternatives.alternatives.every((alternative) => alternative.preservesHardConstraints), "an alternative silently weakened a hard constraint");
  assert(hardAlternatives.alternatives.every((alternative) => Object.keys(alternative.shortfallByGoal).length > 0), "alternatives hid the soft-goal shortfall");
  metrics.hardConstraintAlternatives = hardAlternatives.alternatives.length;
  metrics.hardConstraintAggregateShortfallMinor = hardAlternatives.aggregateShortfall.amountMinor;

  const financeGraph = {
    nodes: ["loop-a", "loop-b", "loop-c", "loop-d"].map((id) => ({ id, label: id, evidence: { truthClass: "OBSERVED", sourceIds: [id] } })),
    edges: [
      { id: "loop-ab", from: "loop-a", to: "loop-b", kind: "DEPENDENCY", evidence: { truthClass: "DERIVED", sourceIds: ["loop-ab"] } },
      { id: "loop-bc", from: "loop-b", to: "loop-c", kind: "DEPENDENCY", evidence: { truthClass: "DERIVED", sourceIds: ["loop-bc"] } },
      { id: "loop-cb", from: "loop-c", to: "loop-b", kind: "DEPENDENCY", evidence: { truthClass: "DERIVED", sourceIds: ["loop-cb"] } },
      { id: "loop-ad", from: "loop-a", to: "loop-d", kind: "DEPENDENCY", scenarioId: "downside", evidence: { truthClass: "ASSUMPTION", sourceIds: ["loop-ad"] } },
      { id: "loop-da-feedback", from: "loop-d", to: "loop-a", kind: "FEEDBACK", scenarioId: "downside", evidence: { truthClass: "MODELED", sourceIds: ["loop-da-feedback"] } }
    ]
  };
  const financeGraphAnalysis = analyzeFinanceGraph(financeGraph);
  const baselinePropagation = propagateFinanceGraph(financeGraph, { "loop-a": 1, "loop-b": 2, "loop-c": 3, "loop-d": 4 }, { derive: (nodeId, inputs) => inputs.length > 0 ? inputs.reduce((sum, value) => sum + value, 0) : undefined });
  const scenarioAnalysis = analyzeFinanceGraph(financeGraph, "downside");
  assert(financeGraphAnalysis.cycleNodeIds.join(",") === "loop-b,loop-c", "accidental Finance cycle was not quarantined");
  assert(baselinePropagation.invalidatedNodeIds.includes("loop-b") && baselinePropagation.invalidatedNodeIds.includes("loop-c"), "ordinary propagation resolved an accidental cycle");
  assert(financeGraphAnalysis.ignoredScenarioEdgeIds.includes("loop-ad") && financeGraphAnalysis.feedbackEdgeIds.includes("loop-da-feedback"), "scenario or feedback edge escaped baseline propagation");
  assert(!scenarioAnalysis.ignoredScenarioEdgeIds.includes("loop-ad"), "explicit scenario edge was not admitted to its scenario");
  const feedback = evaluateFinanceFeedbackLoop({ balance: 100 }, (values) => ({ balance: values.balance * 0.5 + 10 }), { scenarioId: "bounded-feedback", maxIterations: 50, tolerance: 0.000001 });
  const nonConvergent = evaluateFinanceFeedbackLoop({ balance: 0 }, (values) => ({ balance: values.balance + 1 }), { scenarioId: "bounded-non-convergent", maxIterations: 3, tolerance: 0 });
  assert(feedback.status === "CONVERGED" && nonConvergent.status === "NON_CONVERGED", "feedback solver did not report bounded convergence behavior");
  metrics.quarantinedFinanceCycleNodes = financeGraphAnalysis.cycleNodeIds.length;
  metrics.modeledFeedbackStatus = feedback.status;
  metrics.nonConvergentFeedbackStatus = nonConvergent.status;

  const projectedDependencyGraph = projectDependencyGraph(records);
  const dependencyAnalysis = analyzeDependencyGraph(projectedDependencyGraph);
  const authorizedIds = records.filter((candidate) => candidate.id !== "private-outside-scope" && candidate.id !== "dependency-private-outside").map((candidate) => candidate.id);
  const dependencyImpact = projectAuthorizedDependencyImpact(records, [resource.id], authorizedIds);
  assert(dependencyAnalysis.invalidNodeIds.length === 0, "canonical dependency projection contains invalid endpoints");
  assert(dependencyImpact.affectedIds.includes("goal-emergency") && dependencyImpact.affectedIds.includes("derived-finance-brief"), "authorized dependency impact missed downstream projections");
  assert(!dependencyImpact.affectedIds.includes("private-outside-scope"), "unauthorized dependency target entered the impact projection");
  metrics.authorizedDependencyAffectedIds = dependencyImpact.affectedIds.length;
  metrics.dependencyOwnerDomains = dependencyImpact.affectedOwnerIds?.length ?? 0;

  const discovery = buildDiscoveryRecords();
  const discoveryResult = discoverDependencyLinks(discovery.records, discovery.authorizedIds);
  assert(discoveryResult.deterministic.length === 1 && discoveryResult.deterministic[0]?.confidence === "HIGH", "explicit dependency discovery was not deterministic");
  assert(discoveryResult.proposals.length === 1 && discoveryResult.proposals[0]?.confidence === "AMBIGUOUS", "ambiguous relationship was auto-promoted");
  assert(discoveryResult.excluded.length === 1 && discoveryResult.excluded[0]?.targetId === "discover-private", "out-of-scope relationship was not excluded");
  metrics.deterministicDependencyLinks = discoveryResult.deterministic.length;
  metrics.ambiguousDependencyProposals = discoveryResult.proposals.length;
  metrics.excludedDependencyReferences = discoveryResult.excluded.length;

  const transactionFixtures = records.map(toFinanceTransaction).filter((value) => value !== undefined);
  const transferAnalysis = matchFinanceTransfers(transactionFixtures);
  assert(transferAnalysis.matches.length === 1 && transferAnalysis.matches[0]?.kind === "INTERNAL_TRANSFER", "exact internal transfer was not matched");
  assert(transferAnalysis.unmatchedTransactionIds.includes("unmatched-transfer"), "unmatched transfer was silently suppressed");
  assert(projection.transferAnalysis.matches.length === transferAnalysis.matches.length, "integrated Finance transfer projection diverged");
  metrics.transferMatches = transferAnalysis.matches.length;
  metrics.unmatchedTransferCandidates = transferAnalysis.unmatchedTransactionIds.length;

  const vintage = createFinanceForecast({ vintageId: "forecast-vintage-2026-09", createdAt: FIXTURE_TIME, startMonth: "2026-10", openingCash: money("100000"), monthlyIncome: money("50000"), monthlySpending: money("30000"), horizonMonths: 3, scenario: "BASE", sourceIds: ["source:monthly-statements"] });
  const forecastErrors = compareFinanceForecastToActual(vintage, [{ month: "2026-10", closingCash: money("125000") }]);
  assert(vintage.points.length === 3 && forecastErrors.length === 1 && forecastErrors[0]?.error.amountMinor === "5000", "forecast vintage or actual comparison is incorrect");
  const forecastProjection = projectFinanceState(records, { currency: "CAD", asOfDate: "2026-09-20", forecastVintages: [vintage] });
  assert(forecastProjection.forecastVintages[0]?.id === vintage.id, "Finance projection did not retain forecast vintage identity");
  metrics.forecastVintagePoints = vintage.points.length;
  metrics.forecastComparisonErrors = forecastErrors.length;

  const reviewContexts = {
    "scam-induced-transfer": { authenticated: true, userInitiated: true, possibleScamOrCoercion: true, evidence: ["context:scam"] },
    "familiar-high-impact": { familiarMerchant: true, evidence: ["context:familiar-merchant"] },
    "benign-anomaly": { benignExplanation: "Synthetic annual renewal confirmed by the user", evidence: ["context:benign"] }
  };
  const reviewEvaluation = evaluateFinanceReviewCases(transactionFixtures, reviewContexts, [
    { transactionId: "scam-induced-transfer", disposition: "POSSIBLE_SCAM_OR_COERCION", scope: { accountId: "checking" }, reason: "Synthetic context indicates coercion risk", resolvedAt: FIXTURE_TIME, sourceIds: ["context:scam"] },
    { transactionId: "benign-anomaly", disposition: "CONFIRMED_LEGITIMATE", scope: { accountId: "checking", merchant: "synthetic annual vendor" }, reason: "Synthetic renewal was confirmed", resolvedAt: FIXTURE_TIME, sourceIds: ["context:benign"] }
  ], ["scam-induced-transfer", "familiar-high-impact", "benign-anomaly"]);
  const scamCase = reviewEvaluation.cases.find((review) => review.transactionId === "scam-induced-transfer");
  const familiarCase = reviewEvaluation.cases.find((review) => review.transactionId === "familiar-high-impact");
  const benignCase = reviewEvaluation.cases.find((review) => review.transactionId === "benign-anomaly");
  assert(scamCase?.disposition === "POSSIBLE_SCAM_OR_COERCION" && scamCase.priority === "URGENT_REVIEW", "scam/coercion context was collapsed into ordinary legitimacy");
  assert(familiarCase?.priority === "HIGH" && familiarCase.disposition === "UNRESOLVED", "familiar high-impact anomaly was treated as proof of legitimacy");
  assert(benignCase?.disposition === "CONFIRMED_LEGITIMATE", "scoped benign resolution was not retained");
  assert(reviewEvaluation.metrics.available && reviewEvaluation.metrics.observableMissedKnownIssueCount === 0, "review quality metrics did not fail closed with known synthetic history");
  metrics.reviewCases = reviewEvaluation.cases.length;
  metrics.reviewResolved = reviewEvaluation.metrics.resolvedCount;
  metrics.reviewConfirmedLegitimate = reviewEvaluation.metrics.confirmedLegitimateCount;
  metrics.reviewObservableMissedKnownIssues = reviewEvaluation.metrics.observableMissedKnownIssueCount;

  const directFire = projectFireScenario({ scenarioId: "direct-sequence", retirementDate: "2031-09-20", currency: "CAD", currentInvestments: money("2500000"), annualContribution: money("120000"), annualSpending: money("60000"), yearsToRetirement: 5, yearsInRetirement: 10, nominalReturnRate: 0.05, inflationRate: 0.02, annualFeesRate: 0.01, effectiveTaxRate: 0.2, withdrawalRate: 0, downsideFirstReturns: [-0.2, -0.1, 0.02], upsideFirstReturns: [0.15, 0.1, 0.05] });
  assert(directFire.truthClass === "MODELED" && directFire.realAtRetirement < directFire.nominalAtRetirement && directFire.afterTaxNominalAtRetirement < directFire.nominalAtRetirement, "nominal/real or pre/post-tax FIRE bases are inconsistent");
  assert(directFire.downsideSequenceEnd !== directFire.upsideSequenceEnd, "FIRE sequence sensitivity did not change the modeled result");
  metrics.fireSequenceSensitivity = Math.abs(directFire.downsideSequenceEnd - directFire.upsideSequenceEnd);

  return { schemaVersion: 1, kind: "finance-phase4-benchmark-result", status: "PASS", authority: "Current source-contract benchmark for OMN-ACC-159..171; not implementation or human-acceptance evidence.", current, coveredRows, limitations, metrics };
}

let result;
try {
  result = await runBenchmark();
} catch (error) {
  let current;
  try { current = currentIdentity(); } catch { current = undefined; }
  result = {
    schemaVersion: 1,
    kind: "finance-phase4-benchmark-result",
    status: "FAIL",
    authority: "Current source-contract benchmark for OMN-ACC-159..171; fail-closed on invariant failure.",
    ...(current ? { current } : {}),
    coveredRows,
    limitations,
    metrics: {},
    error: error instanceof Error ? error.message : String(error)
  };
  process.exitCode = 1;
}
console.log(JSON.stringify(result));
