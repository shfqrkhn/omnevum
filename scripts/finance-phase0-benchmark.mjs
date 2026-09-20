import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "fake-indexeddb/auto";
import { createServer } from "vite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_TIME = "2026-09-20T00:00:00.000Z";
const databaseName = `omnevum-finance-phase0-${process.pid}`;
const sourceFiles = [
  "src/core/commands.ts",
  "src/core/finance-model.ts",
  "src/core/finance-profile.test.ts",
  "src/core/finance-profile.ts",
  "src/core/finance-projection.ts",
  "src/core/finance.ts",
  "src/core/finance.test.ts",
  "src/core/model.ts",
  "src/core/money.ts",
  "src/core/storage.ts",
  "scripts/finance-phase0-benchmark.mjs"
].sort();
const read = (path) => readFileSync(join(root, path));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const git = process.platform === "win32" ? "git.exe" : "git";
const revision = execFileSync(git, ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const workingTree = execFileSync(git, ["status", "--short"], { cwd: root, encoding: "utf8" }).trim();
const sourceSha256 = sha256(sourceFiles.map((path) => `${path}\0${read(path).toString("utf8")}`).join("\0"));
const checks = [];
const metrics = {};
const assert = (condition, message) => { if (!condition) throw new Error(`FINANCE_PHASE0_BENCHMARK_FAIL: ${message}`); };
const check = (name, condition, message) => { assert(condition, message); checks.push(name); };
const money = (amountMinor, currency = "CAD") => ({ amountMinor: String(amountMinor), currency });

function source(sourceId, name, accountId, sha, openingBalance, closingBalance, sourceClass) {
  return { sourceId, name, accountId, currency: "CAD", sha256: sha, openingBalance: money(openingBalance), closingBalance: money(closingBalance), sourceClass, sourceArtifactId: `artifact:${sourceId}` };
}

function record(id, data, overrides = {}) {
  return {
    id, recordType: "observation", owner: "core.capture", schemaVersion: 1, createdAt: FIXTURE_TIME, modifiedAt: FIXTURE_TIME,
    provenance: { source: "USER_INPUT", capturedAt: FIXTURE_TIME, sourceId: id }, truthClass: "USER_OBSERVATION", sensitivity: "PRIVATE", revision: 1, deleted: false, data, ...overrides
  };
}

function relationship(id, sourceId, targetId, edgeKind, extra = {}) {
  return record(id, { kind: "dependency-link", version: 1, sourceId, targetId, edgeKind, status: "ACTIVE", label: `${edgeKind} fixture`, text: `${sourceId} -> ${targetId}`, ...extra }, { recordType: "relationship", owner: "platform.dependency", sensitivity: "SHARED" });
}

function buildRows() {
  const checking = source("finance:checking:2026-01", "checking January export", "checking", "1".repeat(64), "10000", "138800", "TRANSACTION_ACCOUNT");
  const credit = source("finance:credit:2026-01", "Visa credit-card statement", "credit-card", "2".repeat(64), "0", "0", "CREDIT_CARD");
  const savings = source("finance:savings:2026-01", "savings account export", "savings", "3".repeat(64), "0", "50000", "TRANSACTION_ACCOUNT");
  const debt = source("finance:loan:2026-01", "mortgage loan statement", "mortgage", "4".repeat(64), "100000", "94500", "DEBT");
  const income = source("finance:payroll:2026-01", "employer payroll pay-stub", "payroll", "5".repeat(64), "0", "300000", "INCOME");
  const investment = source("finance:brokerage:2026-01", "brokerage investment valuation", "brokerage", "6".repeat(64), "2500000", "2500000", "INVESTMENT");
  return {
    sources: { checking, credit, savings, debt, income, investment },
    checkingTransactions: `Date,Description,Debit,Credit,Id,Essential\n2026-01-02,Salary,,3000.00,checking-salary,\n2026-01-03,Rent,1000.00,,checking-rent,true\n2026-01-04,Payment to credit card,200.00,,checking-card,\n2026-01-05,Transfer to savings,500.00,,checking-savings,\n2026-01-06,Cafe,12.00,,checking-cafe,\n`,
    creditTransactions: `Date,Description,Amount,Id\n2026-01-04,Credit card payment,200.00,credit-payment\n2026-01-04,Grocery,-200.00,credit-grocery\n`,
    savingsTransactions: `Date\tDescription\tAmount\tId\n2026-01-05\tTransfer from checking\t500.00\tsavings-transfer\n`,
    debtTransactions: `Date\tDescription\tAmount\tId\n2026-01-10\tPrincipal payment\t-50.00\tloan-principal\n2026-01-10\tInterest\t-5.00\tloan-interest\n`,
    incomeTransactions: `Date,Description,Amount,Id\n2026-01-02,Employer payroll,3000.00,payroll-jan\n`,
    creditFacts: `StatementBalance,DueDate,MinimumDue,CreditLimit\n200.00,2026-02-15,25.00,1000.00\n`,
    investmentFacts: `PeriodStart\tPeriodEnd\tBeginningValue\tEndingValue\tPerformanceMethod\tValuation\tValuationDate\n2026-01-01\t2026-01-31\t24000.00\t25000.00\tTIME_WEIGHTED\t25000.00\t2026-01-31\n`
  };
}

function buildGoalFixtures() {
  const resource = record("finance-resource-phase0", { kind: "finance-resource", label: "Shared savings", text: "One canonical shared savings resource", amountMinor: "10000", currency: "CAD" });
  const reserve = record("finance-goal-reserve-phase0", { kind: "finance-goal", label: "Emergency reserve", text: "Emergency reserve", targetKind: "ROLLING_ESSENTIAL_MONTHS", targetMonths: 6, currency: "CAD", targetDate: "2027-01-01", sustainableMonthlySurplusMinor: "3000" });
  const travel = record("finance-goal-travel-phase0", { kind: "finance-goal", label: "Travel", text: "Travel", targetAmountMinor: "20000", currency: "CAD", targetDate: "2027-01-01", sustainableMonthlySurplusMinor: "3000" });
  const reserveAllocation = relationship("finance-allocation-reserve-phase0", resource.id, reserve.id, "ALLOCATION", { allocationMode: "EXCLUSIVE", allocation: money("6000") });
  const travelAllocation = relationship("finance-allocation-travel-phase0", resource.id, travel.id, "ALLOCATION", { allocationMode: "EXCLUSIVE", allocation: money("3000") });
  const essential = ["2026-01", "2026-02", "2026-03"].map((month, index) => record(`essential-${month}-phase0`, { kind: "finance-transaction", merchant: "rent", description: "Rent", amountMinor: index === 2 ? "-2000" : "-1000", currency: "CAD", accountId: "checking", postedAt: `${month}-02T00:00:00.000Z`, status: "POSTED", essential: true, naturalKey: `checking|${month}-02|CAD|-${index === 2 ? "2000" : "1000"}|rent`, financeLineage: { sourceId: "finance:checking:essential", sourceSha256: "e".repeat(64), sourceRow: index + 1, parserProfile: "STRUCTURED_V1", rawFields: {} } }, { owner: "domain.finance", truthClass: "IMPORTED_RECORD", provenance: { source: "IMPORT", capturedAt: FIXTURE_TIME, sourceId: "finance:checking:essential" } }));
  return { resource, reserve, travel, reserveAllocation, travelAllocation, essential };
}

function buildReviewTransactions() {
  const make = (id, amountMinor, postedAt, merchant = "familiar grocer") => ({
    id, accountId: "review-account", postedAt, description: merchant, merchant: merchant.toLocaleLowerCase("en-CA"), amount: money(amountMinor), direction: "OUTFLOW", status: "POSTED", naturalKey: `review:${id}`, lineage: { sourceId: "finance:review-fixture", sourceSha256: "r".repeat(64), sourceRow: 1, parserProfile: "STRUCTURED_V1", rawFields: {} }
  });
  const history = Array.from({ length: 7 }, (_, index) => make(`review-history-${index}`, "-1000", `2026-0${index + 1}-08T00:00:00.000Z`));
  return [...history, make("review-outlier", "-15000", "2026-08-08T00:00:00.000Z"), make("review-rapid-1", "-50", "2026-08-08T01:00:00.000Z", "rapid vendor"), make("review-rapid-2", "-60", "2026-08-08T02:00:00.000Z", "rapid vendor"), make("review-rapid-3", "-70", "2026-08-08T03:00:00.000Z", "rapid vendor")];
}

async function loadApis() {
  const vite = await createServer({ root, appType: "custom", logLevel: "silent", server: { hmr: false, middlewareMode: true } });
  const modules = await Promise.all([
    vite.ssrLoadModule("/src/core/commands.ts"),
    vite.ssrLoadModule("/src/core/finance.ts"),
    vite.ssrLoadModule("/src/core/finance-model.ts"),
    vite.ssrLoadModule("/src/core/finance-profile.ts"),
    vite.ssrLoadModule("/src/core/finance-projection.ts"),
    vite.ssrLoadModule("/src/core/storage.ts")
  ]);
  return { vite, commands: modules[0], finance: modules[1], model: modules[2], profile: modules[3], projection: modules[4], storage: modules[5] };
}

async function run() {
  const { vite, commands: commandsApi, finance, model, profile, projection, storage } = await loadApis();
  const { CommandBus } = commandsApi;
  const { CanonicalStore } = storage;
  const {
    acceptFinanceBatch, acceptFinanceTransactions, correctFinanceTransaction, createFinanceSourceId, parseFinanceCsv, parseFinanceCsvWithProfile, parseFinanceStatementFactsCsv, inspectFinanceCsvProfile
  } = finance;
  const { assessFinanceParserProfile, createFinanceParserProfileDraft, loadFinanceParserProfile, saveFinanceParserProfile } = profile;
  const {
    classifyFinanceSource, createFinanceForecast, detectFinanceParserDrift, detectFinanceReviewCases, evaluateFinanceReviewCases,
    evaluateFinanceWhatIf, analyzeFinanceRecurrence, reconcileFinanceForecast
  } = model;
  const { projectFinanceState, toFinanceTransaction } = projection;
  const fixture = buildRows();
  const { checking, credit, savings, debt, income, investment } = fixture.sources;
  const store = new CanonicalStore(databaseName);
  await store.open();
  const commands = new CommandBus(store);
  try {
    const classifications = [
      classifyFinanceSource(checking.name, ["Date", "Debit", "Credit"]), classifyFinanceSource(credit.name, ["StatementBalance"]),
      classifyFinanceSource(investment.name, ["Valuation", "Portfolio"]), classifyFinanceSource(debt.name, ["Principal", "Interest"]), classifyFinanceSource(income.name, ["Pay Stub", "Salary"])
    ];
    check("five-source-classification", classifications.map((item) => item.sourceClass).join(",") === "TRANSACTION_ACCOUNT,CREDIT_CARD,INVESTMENT,DEBT,INCOME", "mixed source classification did not retain all five source classes");
    check("source-fingerprint-is-account-scoped", createFinanceSourceId(checking.sha256, checking.accountId, checking.currency) !== createFinanceSourceId(checking.sha256, savings.accountId, savings.currency) && !createFinanceSourceId(checking.sha256, checking.accountId, checking.currency).includes(checking.accountId), "source fingerprint identity leaked account data or ignored account scope");

    const checkingTransactions = parseFinanceCsv(fixture.checkingTransactions, checking);
    const creditTransactions = parseFinanceCsv(fixture.creditTransactions, credit);
    const savingsTransactions = parseFinanceCsv(fixture.savingsTransactions, savings);
    const debtTransactions = parseFinanceCsv(fixture.debtTransactions, debt);
    const incomeTransactions = parseFinanceCsv(fixture.incomeTransactions, income);
    const creditFacts = parseFinanceStatementFactsCsv(fixture.creditFacts, credit, "CREDIT_CARD");
    const investmentFacts = parseFinanceStatementFactsCsv(fixture.investmentFacts, investment, "INVESTMENT");
    check("material-format-parsing", checkingTransactions.length === 5 && creditTransactions.length === 2 && savingsTransactions.length === 1 && debtTransactions.length === 2 && incomeTransactions.length === 1 && creditFacts.creditCard?.statementBalance.amountMinor === "20000" && investmentFacts.investment?.performance?.method === "TIME_WEIGHTED", "one or more materially different finance source formats did not parse");
    check("lineage-and-credential-boundary", checkingTransactions.every((transaction) => transaction.lineage.sourceId === checking.sourceId && transaction.lineage.sourceSha256 === checking.sha256 && !Object.keys(transaction.lineage.rawFields).some((key) => /password|token|authorization|secret/i.test(key))), "source lineage or credential minimization was not retained");

    const entries = [
      { source: checking, transactions: checkingTransactions },
      { source: credit, transactions: creditTransactions, statementFacts: creditFacts },
      { source: savings, transactions: savingsTransactions },
      { source: debt, transactions: debtTransactions },
      { source: income, transactions: incomeTransactions },
      { source: investment, transactions: [], statementFacts: investmentFacts }
    ];
    const firstBatch = await acceptFinanceBatch(commands, entries);
    check("mixed-batch-canonical-acceptance", firstBatch.sourceResults.length === 6 && firstBatch.created === 11 && firstBatch.records.length === 13 && firstBatch.sourceResults.every((result) => result.reconciliation.status === "MATCH"), `mixed source batch did not produce one canonical owner result per source with reconciliations: ${JSON.stringify(firstBatch)}`);
    check("material-exceptions-stay-visible", firstBatch.sourceResults.every((result) => result.limitations.every((limitation) => typeof limitation === "string" && limitation.length > 0)), "source exceptions were not represented as explicit limitations");
    metrics.firstBatch = { sources: firstBatch.sourceResults.length, created: firstBatch.created, records: firstBatch.records.length };

    const secondBatch = await acceptFinanceBatch(commands, entries);
    check("idempotent-batch-reimport", secondBatch.created === 0 && secondBatch.existing === 11 && secondBatch.conflicts.length === 0, "re-importing the same mixed batch created duplicates or conflicts");
    const renamedSource = { ...checking, sourceId: "finance:checking:renamed", name: "renamed-checking.tsv", sha256: "7".repeat(64) };
    const renamed = parseFinanceCsv(fixture.checkingTransactions, renamedSource);
    const renamedResult = await acceptFinanceTransactions(commands, renamedSource, renamed);
    check("renamed-overlap-deduplicated", renamedResult.created === 0 && renamedResult.existing === checkingTransactions.length && renamedResult.conflicts.length === 0, "renamed overlapping source was not deduplicated by transaction identity");
    const repeatedSource = { ...checking, sourceId: "finance:checking:followup", name: "followup.csv", sha256: "8".repeat(64), openingBalance: money("0"), closingBalance: money("-1200") };
    const repeated = parseFinanceCsv("Date,Description,Amount,Id\n2026-01-20,Cafe,-12.00,checking-cafe-followup\n", repeatedSource);
    const repeatedResult = await acceptFinanceTransactions(commands, repeatedSource, repeated);
    check("legitimate-repeat-preserved", repeatedResult.created === 1 && repeatedResult.conflicts.length === 0, "a legitimate repeated real-world transaction was discarded");
    const ambiguousSource = { ...checking, sourceId: "finance:checking:ambiguous", name: "ambiguous.csv", sha256: "9".repeat(64), openingBalance: money("0"), closingBalance: money("-1200") };
    const ambiguous = parseFinanceCsv("Date,Description,Amount,Id\n2026-01-06,Parking,-12.00,checking-parking\n", ambiguousSource);
    const ambiguousResult = await acceptFinanceTransactions(commands, ambiguousSource, ambiguous);
    check("near-duplicate-routed", ambiguousResult.created === 1 && ambiguousResult.conflicts.some((conflict) => conflict.reason === "AMBIGUOUS_NEAR_DUPLICATE") && ambiguousResult.records[0]?.data.reviewRequired === true, "an ambiguous near duplicate was silently accepted without review state");
    metrics.reimport = { sameBatchExisting: secondBatch.existing, renamedExisting: renamedResult.existing, nearDuplicateConflicts: ambiguousResult.conflicts.length };

    const parserProfile = { id: "checking-profile-v1", sourceClass: "TRANSACTION_ACCOUNT", requiredHeaders: ["date", "description", "amount", "id"], headerFingerprint: "amount|date|description|id", signConvention: "SIGNED_AMOUNT" };
    const stableProfile = detectFinanceParserDrift(parserProfile, ["Date", "Description", "Amount", "Id"]);
    const driftedProfile = detectFinanceParserDrift(parserProfile, ["Date", "Description", "Debit", "Credit", "Id"]);
    check("parser-profile-stability-and-drift", stableProfile.status === "STABLE" && driftedProfile.status === "DRIFT" && driftedProfile.missingHeaders.includes("amount") && driftedProfile.addedHeaders.includes("debit"), "parser profile did not distinguish stable structure from sign/header drift");

    const durableProfileSource = { ...checking, sourceId: "finance:checking:durable-profile", name: "durable-profile.csv", sha256: "f".repeat(64) };
    const stableProfileText = "Date,Description,Amount,Id\n2026-01-08,Profile sentinel,-12.00,profile-1\n";
    const stableObservation = inspectFinanceCsvProfile(stableProfileText);
    const initialProfile = await saveFinanceParserProfile(commands, createFinanceParserProfileDraft(durableProfileSource, stableObservation));
    const reloadedProfile = await loadFinanceParserProfile(commands, initialProfile.profile.scope);
    const stableProfileRows = parseFinanceCsvWithProfile(stableProfileText, durableProfileSource, reloadedProfile);
    check("durable-parser-profile-persistence", initialProfile.created && initialProfile.profile.profileRevision === 1 && reloadedProfile?.profileId === initialProfile.profile.profileId && stableProfileRows[0]?.lineage.parserProfile === "PERSISTED_PROFILE_V1" && stableProfileRows[0]?.lineage.parserProfileFingerprint === initialProfile.profile.fingerprint, "the account-scoped parser profile was not persisted, reloaded, and bound to imported lineage");

    const driftedProfileText = "Date,Description,Debit,Credit,Id\n2026-01-08,Profile sentinel,12.00,,profile-1\n";
    const driftedObservation = inspectFinanceCsvProfile(driftedProfileText);
    const driftAssessment = assessFinanceParserProfile(reloadedProfile, { accountId: durableProfileSource.accountId, sourceClass: durableProfileSource.sourceClass, format: "CSV", delimiter: driftedObservation.delimiter, headers: driftedObservation.headers, signConvention: driftedObservation.signConvention });
    let driftBlocked = false;
    try {
      parseFinanceCsvWithProfile(driftedProfileText, durableProfileSource, reloadedProfile);
    } catch (error) {
      driftBlocked = error instanceof Error && error.message.includes("cannot be applied");
    }
    const reviewedProfile = await saveFinanceParserProfile(commands, createFinanceParserProfileDraft(durableProfileSource, driftedObservation), { expectedPreviousFingerprint: reloadedProfile.fingerprint, reason: "Reviewed the bank export sign convention change" });
    check("durable-parser-profile-drift-review", driftAssessment.status === "DRIFT" && !driftAssessment.canApply && driftBlocked && reviewedProfile.changed && reviewedProfile.profile.profileRevision === 2 && reviewedProfile.profile.admission === "EXPLICIT_REVIEW" && (reviewedProfile.profile.priorProfileFingerprints ?? []).includes(initialProfile.profile.fingerprint), "parser structure drift was not blocked, explicitly reviewed, and recorded as a new profile revision");
    metrics.parserProfile = { profileId: reviewedProfile.profile.profileId, revision: reviewedProfile.profile.profileRevision, lineageBound: stableProfileRows[0]?.lineage.parserProfileId === initialProfile.profile.profileId, driftStatus: driftAssessment.status, historyEntries: reviewedProfile.profile.priorProfileFingerprints?.length ?? 0 };

    const unmatchedSource = { ...checking, sourceId: "finance:checking:unmatched", name: "unmatched.csv", sha256: "a".repeat(64), openingBalance: money("0"), closingBalance: money("-7000") };
    await acceptFinanceTransactions(commands, unmatchedSource, parseFinanceCsv("Date,Description,Amount,Id\n2026-01-07,Transfer to brokerage,-70.00,unmatched-transfer\n", unmatchedSource));
    const initialRecords = await store.list(true);
    const initialProjection = projectFinanceState(initialRecords, { currency: "CAD", asOfDate: "2026-09-20", requiredPeriods: ["2026-01"], requiredSourceIds: ["finance:missing-statement"], requiredSourceClasses: ["INVESTMENT"], changedIds: [checkingTransactions[0].id] });
    check("transfer-reconciliation-and-unmatched", initialProjection.transferAnalysis.matches.length === 2 && initialProjection.transferAnalysis.unresolvedMatches.length >= 1, `matched account movements or the unmatched transfer was suppressed: ${JSON.stringify(initialProjection.transferAnalysis)}`);
    check("missing-data-does-not-become-zero", initialProjection.quality.status === "UNKNOWN" && initialProjection.quality.missingSourceIds.includes("finance:missing-statement"), "missing source evidence was coerced into a complete Finance result");

    const recurring = parseFinanceCsv(`Date,Description,Amount,Id,Status\n2026-01-02,Payroll,3000.00,rec-pay-1,POSTED\n2026-02-02,Payroll,3000.00,rec-pay-2,POSTED\n2026-03-02,Payroll,3000.00,rec-pay-3,POSTED\n2026-01-10,Stream subscription,-10.00,rec-sub-1,POSTED\n2026-02-10,Stream subscription,-10.00,rec-sub-2,POSTED\n2026-03-10,Stream subscription,-12.00,rec-sub-3,POSTED\n2026-04-17,Stream subscription,-12.00,rec-sub-4,POSTED\n2026-01-05,Travel merchant,-100.00,rec-charge,POSTED\n2026-02-25,Travel merchant refund,100.00,rec-refund,REFUNDED\n`, { ...checking, sourceId: "finance:recurring", name: "recurring.csv", sha256: "b".repeat(64) });
    const recurringCopy = { ...recurring[1], id: "rec-sub-duplicate", naturalKey: recurring[1].naturalKey };
    const recurrence = analyzeFinanceRecurrence([...recurring, recurringCopy], { asOfDate: "2026-06-20", minimumOccurrences: 3, graceDays: 5 });
    check("recurring-exception-analysis", recurrence.patterns.length >= 2 && recurrence.signals.some((signal) => signal.kind === "MISSING") && recurrence.signals.some((signal) => signal.kind === "PRICE_CHANGE") && recurrence.signals.some((signal) => signal.kind === "DUPLICATE") && recurrence.signals.some((signal) => signal.kind === "REFUND"), "recurring salary/subscription/missing/price/duplicate/refund signals were incomplete");
    const reviewTransactions = buildReviewTransactions();
    const reviewCases = detectFinanceReviewCases(reviewTransactions);
    const review = evaluateFinanceReviewCases(reviewTransactions, { "review-outlier": { familiarMerchant: true, possibleScamOrCoercion: true, evidence: ["review-context"] } }, [{ transactionId: "review-outlier", disposition: "POSSIBLE_SCAM_OR_COERCION", scope: { accountId: "review-account", merchant: "familiar grocer" }, reason: "Synthetic review context", resolvedAt: FIXTURE_TIME, sourceIds: ["review-context"] }], ["review-outlier"]);
    check("explainable-anomaly-review", reviewCases.some((item) => item.transactionId === "review-outlier" && item.baseline?.historyStrength === "STRONG") && review.cases.some((item) => item.transactionId === "review-outlier" && item.priority === "URGENT_REVIEW" && item.disposition === "POSSIBLE_SCAM_OR_COERCION"), "anomaly review lost baseline, context, priority, or scam/coercion distinction");

    const goals = buildGoalFixtures();
    const goalBaseRecords = initialRecords.filter((candidate) => !(candidate.data.kind === "finance-transaction" && candidate.data.financeLineage && typeof candidate.data.financeLineage === "object" && candidate.data.financeLineage.sourceId === checking.sourceId));
    const goalProjection = projectFinanceState([...goalBaseRecords, ...goals.essential, goals.resource, goals.reserve, goals.travel, goals.reserveAllocation, goals.travelAllocation], { currency: "CAD", asOfDate: "2026-09-20" });
    const allocation = goalProjection.financeAllocationResults.find((entry) => entry.resourceId === goals.resource.id)?.result;
    const reservePlan = goalProjection.financeGoalPlans.find((entry) => entry.recordId === goals.reserve.id)?.plan;
    check("dynamic-goal-and-shared-allocation", allocation?.overAllocated.amountMinor === "0" && allocation?.unallocated.amountMinor === "1000" && reservePlan?.target.amountMinor === "7998", `dynamic essential-spending target or virtual allocation was not recomputed without double counting: ${JSON.stringify({ allocation, reservePlan })}`);
    check("funding-deficit-alternatives", Boolean(goalProjection.financeFundingAnalysis?.fundingConflict) && (goalProjection.financeFundingAnalysis?.alternatives.length ?? 0) >= 2 && goalProjection.financeFundingAnalysis?.alternatives.every((alternative) => alternative.preservesHardConstraints), `funding shortfall did not produce transparent review-only alternatives: ${JSON.stringify({ goals: goalProjection.financeGoalPlans, funding: goalProjection.financeFundingAnalysis })}`);

    const vintages = ["BASE", "DOWNSIDE", "UPSIDE"].map((scenario) => createFinanceForecast({ vintageId: `finance-vintage-${scenario.toLowerCase()}`, createdAt: FIXTURE_TIME, startMonth: "2026-10", openingCash: money("100000"), monthlyIncome: money("50000"), monthlySpending: money("30000"), horizonMonths: 12, scenario, sourceIds: [checking.sourceId] }));
    const forecastActuals = [{ month: "2026-10", closingCash: money("125000"), sourceIds: [checking.sourceId] }];
    const forecastReconciliation = reconcileFinanceForecast(vintages[0], forecastActuals);
    const forecastProjection = projectFinanceState(initialRecords, { currency: "CAD", forecastVintages: vintages, forecastActuals });
    check("forecast-vintage-actualization", vintages.every((vintage) => vintage.points.length === 12) && forecastReconciliation.points[0]?.actualized === true && forecastProjection.forecastVintages.length === 3 && forecastProjection.forecastReconciliations.length === 3, "forecast vintages were not retained while elapsed periods were actualized");
    check("quiet-evidence-linked-brief", initialProjection.updateBrief.materialChange && !initialProjection.updateBrief.quiet && !projectFinanceState(initialRecords).updateBrief.materialChange && projectFinanceState(initialRecords).updateBrief.quiet, "Finance did not distinguish a material update brief from a quiet no-change result");

    const whatIfGraph = {
      nodes: ["income", "cash", "goal"].map((id) => ({ id, label: id, evidence: { truthClass: "OBSERVED", sourceIds: [checking.sourceId] } })),
      edges: [
        { id: "income-cash", from: "income", to: "cash", kind: "DEPENDENCY", evidence: { truthClass: "DERIVED", sourceIds: [checking.sourceId] } },
        { id: "cash-goal", from: "cash", to: "goal", kind: "DEPENDENCY", evidence: { truthClass: "DERIVED", sourceIds: [checking.sourceId] } }
      ]
    };
    const whatIf = evaluateFinanceWhatIf(whatIfGraph, { income: 3000, cash: 1000, goal: 500 }, [{ nodeId: "income", value: 4000, label: "Higher income" }], { scenarioId: "income-upside", alternatives: [{ id: "income-downside", label: "Lower income", changes: [{ nodeId: "income", value: 2000, label: "Lower income" }] }], derive: (nodeId, inputs) => inputs.length > 0 ? inputs.reduce((sum, value) => sum + value, 0) : undefined });
    check("bounded-what-if-propagation", whatIf.truthClass === "MODELED" && whatIf.assumptions[0]?.delta === 1000 && whatIf.alternatives.length === 1 && whatIf.baselineValues.income === 3000, "what-if changes did not preserve baseline or propagate explicit alternatives");

    const sharedTravel = record("shared-travel-phase0", { kind: "travel-plan", label: "Shared source trip", financeProjection: { authorized: true, estimatedCostMinor: "12000", currency: "CAD", dueDate: "2027-01-01" } }, { owner: "domain.travel", truthClass: "IMPORTED_RECORD", provenance: { source: "IMPORT", capturedAt: FIXTURE_TIME, sourceId: checking.sourceId } });
    const consumerProjection = projectFinanceState([...initialRecords, sharedTravel], { currency: "CAD", changedIds: [checkingTransactions[0].id] });
    check("one-source-multiple-consumers", consumerProjection.sourceIds.includes(checking.sourceId) && consumerProjection.updateBrief.sourceIds.includes(checking.sourceId) && consumerProjection.crossDomain.sourceIds.includes(checking.sourceId), "one imported source was not reused across authorized Finance, brief, and cross-domain projections");

    const correctionTarget = (await store.list(true)).find((candidate) => candidate.data.kind === "finance-transaction" && candidate.data.sourceTransactionId === "checking-cafe");
    assert(correctionTarget, "correction fixture was not imported");
    const corrected = await correctFinanceTransaction(commands, correctionTarget.id, { amount: "-13.00", essential: true }, correctionTarget.revision);
    const correctedProjection = projectFinanceState(await store.list(true), { currency: "CAD", changedIds: [corrected.id] });
    check("canonical-correction-propagation", corrected.revision === 2 && (await store.history(corrected.id)).length === 2 && correctedProjection.updateBrief.materialChange && correctedProjection.summary?.postedSpending.amountMinor !== initialProjection.summary?.postedSpending.amountMinor, "one canonical correction did not retain history and recompute dependent projection state");

    const bulkSource = { ...checking, sourceId: "finance:bulk-monthly", name: "bulk-monthly.csv", sha256: "c".repeat(64), openingBalance: money("0"), closingBalance: money("-120") };
    const bulkRows = ["Date,Description,Amount,Id", ...Array.from({ length: 240 }, (_, index) => { const date = new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10); return `${date},Bulk merchant ${index},-${index + 1}.00,bulk-${index}`; })].join("\n");
    const bulkTransactions = parseFinanceCsv(bulkRows, bulkSource);
    const bulkResult = await acceptFinanceTransactions(commands, bulkSource, bulkTransactions);
    check("bounded-hundreds-transaction-path", bulkTransactions.length === 240 && bulkResult.created === 240 && (await store.list()).filter((candidate) => candidate.data.kind === "finance-transaction").length >= 250, "the bounded several-hundred transaction path did not remain canonical and replayable");
    metrics.bulkTransactions = bulkResult.created;
    metrics.projection = { transactions: initialProjection.transactionCount, transferMatches: initialProjection.transferAnalysis.matches.length, recurringSignals: recurrence.signals.length, reviewCases: review.cases.length };
    return {
      schemaVersion: 1,
      kind: "finance-phase0-benchmark-result",
      status: "PASS",
      authority: "Current source/runtime contract benchmark for OMN-ACC-133..151; bounded implementation evidence, not human acceptance, release, real-statement suitability, or cross-browser evidence.",
      current: { revision, workingTree, sourceFiles, sourceSha256, sourceHashDefinition: "SHA-256 of sorted repository-relative source paths and exact current UTF-8 bytes." },
      coveredRows: Array.from({ length: 19 }, (_, index) => `OMN-ACC-${133 + index}`),
      checks,
      checkCount: checks.length,
      metrics,
      limitations: [
        "Synthetic credential-free fixtures are used; no bank connector, institution credential, live statement, or financial advice is involved.",
        "Durable account-scoped parser persistence, lineage binding, and explicit drift review are contract-tested; routine no-review UX, live connectors, and real institution formats remain open.",
        "This does not prove WebKit/Firefox, assistive technology, human acceptance, hostile XLSX/PDF round-trip, real quota/process faults, rollback, or cross-origin browser Vault restore.",
        "Bulk and model checks prove bounded source/runtime behavior; they do not establish release performance, tax correctness, investment suitability, or fraud detection accuracy."
      ]
    };
  } finally {
    store.close();
    await vite.close();
  }
}

let result;
try {
  result = await run();
} catch (error) {
  result = { schemaVersion: 1, kind: "finance-phase0-benchmark-result", status: "FAIL", authority: "Current source/runtime contract benchmark for OMN-ACC-133..151; fail-closed on invariant failure.", current: { revision, workingTree, sourceFiles, sourceSha256 }, checks, checkCount: checks.length, metrics, error: error instanceof Error ? error.message : String(error) };
  process.exitCode = 1;
}
console.log(result.status === "PASS" ? "FINANCE_PHASE0_BENCHMARK_PASS" : "FINANCE_PHASE0_BENCHMARK_FAIL");
console.log(JSON.stringify(result, null, 2));
