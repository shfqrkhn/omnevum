import { describe, expect, it } from "vitest";
import { acceptFinanceBatch, acceptFinanceStatementFacts, acceptFinanceTransactions, computeFinanceInvestmentPerformance, correctFinanceTransaction, createFinanceSourceId, deduplicateFinanceTransactions, parseFinanceCsv, parseFinanceStatementFactsCsv, reconcileFinanceStatement, type FinanceStatementSource } from "./finance";
import { CommandBus } from "./commands";
import { CanonicalStore } from "./storage";

const source: FinanceStatementSource = {
  sourceId: "source:statement-2026-01",
  name: "checking.csv",
  sha256: "a".repeat(64),
  accountId: "checking-1",
  currency: "CAD",
  openingBalance: { amountMinor: "10000", currency: "CAD" },
  closingBalance: { amountMinor: "10500", currency: "CAD" }
};

describe("credential-free Finance statement semantics", () => {
  it("scopes source identity to the account and currency without exposing the account", () => {
    const first = createFinanceSourceId(source.sha256, source.accountId, source.currency);
    expect(first).toBe(createFinanceSourceId(source.sha256, source.accountId, source.currency));
    expect(first).not.toBe(createFinanceSourceId(source.sha256, "savings-2", source.currency));
    expect(first).not.toContain(source.accountId);
  });

  it("parses quoted CSV, stores exact minor units, and retains source-row lineage", () => {
    const transactions = parseFinanceCsv('Date,Description,Debit,Credit,Id,Category\n2026-01-02,"Cafe, Main",10.00,,tx-1,essential\n2026-01-03,Payroll,,15.00,tx-2,income\n', source);
    expect(transactions).toHaveLength(2);
    expect(transactions[0]).toMatchObject({ amount: { amountMinor: "-1000", currency: "CAD" }, direction: "OUTFLOW", sourceTransactionId: "tx-1", lineage: { sourceId: source.sourceId, sourceSha256: source.sha256, sourceRow: 2, parserProfile: "CSV_HEADER_V1" } });
    expect(transactions[0]?.lineage.rawFields.description).toBe("Cafe, Main");
    expect(transactions[0]?.essential).toBe(true);
    expect(transactions[1]).toMatchObject({ amount: { amountMinor: "1500", currency: "CAD" }, direction: "INFLOW", sourceTransactionId: "tx-2", lineage: { sourceRow: 3 } });
  });

  it("does not carry credential-shaped source columns into durable lineage", () => {
    const [transaction] = parseFinanceCsv('Date,Description,Amount,Authorization\n2026-01-02,Cafe,-10.00,"Bearer never-store"\n', source);
    expect(transaction?.lineage.rawFields).not.toHaveProperty("authorization");
  });

  it("fails closed when a data row adds non-empty fields beyond the declared header", () => {
    expect(() => parseFinanceCsv("Date,Description,Amount\n2026-01-02,Cafe,-10.00,unexpected\n", source)).toThrow("has more fields than its header");
    expect(() => parseFinanceStatementFactsCsv("StatementBalance,DueDate\n500.00,2026-02-15,unexpected\n", source, "CREDIT_CARD")).toThrow("has more fields than its header");
  });

  it("deduplicates exact reimports but preserves source-ID conflicts for review", () => {
    const [first, duplicate, conflicting] = parseFinanceCsv('Date,Description,Amount,Id\n2026-01-02,Cafe,-10.00,tx-1\n2026-01-02,Cafe,-10.00,tx-1\n2026-01-02,Other,-11.00,tx-1\n', source);
    const result = deduplicateFinanceTransactions([first!, duplicate!, conflicting!]);
    expect(result.unique).toHaveLength(2);
    expect(result.duplicates.map((transaction) => transaction.id)).toEqual([duplicate?.id]);
    expect(result.conflicts).toEqual([{ sourceTransactionId: "tx-1", transactionIds: [first?.id, conflicting?.id], reason: "SOURCE_ID_REUSED_WITH_DIFFERENT_MEANING" }]);
  });

  it("deduplicates an overlapping period when the same source is renamed", () => {
    const original = parseFinanceCsv('Date,Description,Amount,Id\n2026-01-02,Cafe,-10.00,tx-1\n', source);
    const renamed = parseFinanceCsv('Date,Description,Amount,Id\n2026-01-02,Cafe,-10.00,tx-1\n', { ...source, sourceId: "source:statement-renamed", name: "renamed.csv", sha256: "b".repeat(64) });
    const result = deduplicateFinanceTransactions([...original, ...renamed]);
    expect(result.unique).toHaveLength(1);
    expect(result.duplicates).toHaveLength(1);
    expect(result.conflicts).toEqual([]);
  });

  it("reconciles opening plus posted activity to closing and leaves pending value explicit", () => {
    const transactions = parseFinanceCsv('Date,Description,Amount,Status\n2026-01-02,Cafe,-10.00,POSTED\n2026-01-03,Payroll,15.00,POSTED\n2026-01-04,Pending card,-2.00,PENDING\n', source);
    const result = reconcileFinanceStatement(source, transactions);
    expect(result).toMatchObject({ status: "MATCH", activity: { amountMinor: "500", currency: "CAD" }, expectedClosingBalance: { amountMinor: "10500", currency: "CAD" }, unexplainedDifference: { amountMinor: "0", currency: "CAD" }, includedTransactionIds: [transactions[0]?.id, transactions[1]?.id], excludedByStatus: { PENDING: 1 } });
  });

  it("does not invent a match when opening or closing evidence is missing", () => {
    const { closingBalance: _closingBalance, ...sourceWithoutClosing } = source;
    const incomplete = reconcileFinanceStatement(sourceWithoutClosing, parseFinanceCsv('Date,Description,Amount\n2026-01-02,Cafe,-10.00\n', source));
    expect(incomplete.status).toBe("INCOMPLETE");
    expect(incomplete.expectedClosingBalance).toBeUndefined();
  });

  it("preserves revolving-credit, investment, and insurance statement facts without overstating performance", () => {
    const credit = parseFinanceStatementFactsCsv("StatementBalance,DueDate,MinimumDue,GracePeriodDays,InterestTerms,CreditLimit\n500.00,2026-02-15,25.00,21,19.99% APR,1000.00\n", source, "CREDIT_CARD");
    expect(credit.creditCard).toMatchObject({ statementBalance: { amountMinor: "50000", currency: "CAD" }, dueDate: "2026-02-15T00:00:00.000Z", minimumDue: { amountMinor: "2500" }, gracePeriodDays: 21, interestTerms: "19.99% APR", creditLimit: { amountMinor: "100000" }, utilization: 0.5 });
    const investment = parseFinanceStatementFactsCsv("PeriodStart,PeriodEnd,BeginningValue,EndingValue,PerformanceMethod,Valuation,ValuationDate\n2026-01-01,2026-12-31,10000.00,11000.00,TIME_WEIGHTED,11000.00,2026-12-31\n", source, "INVESTMENT");
    expect(investment.investment?.performance).toMatchObject({ method: "TIME_WEIGHTED", periodDays: 364, truthClass: "MODELED" });
    expect(investment.investment?.performance?.returnRate).toBeCloseTo(0.1, 10);
    const insurance = parseFinanceStatementFactsCsv("Premium,RenewalDate,ExpiryDate,CoveredAmount,Deductible,Beneficiary,InsuredSubject\n120.00,2026-06-01,2027-06-01,100000.00,500.00,Household,person:self\n", source, "INSURANCE");
    expect(insurance.insurance).toMatchObject({ premium: { amountMinor: "12000" }, renewalAt: "2026-06-01T00:00:00.000Z", expiryAt: "2027-06-01T00:00:00.000Z", coveredAmount: { amountMinor: "10000000" }, deductible: { amountMinor: "50000" }, beneficiary: "Household", insuredSubject: "person:self" });
    expect(insurance.limitations).toEqual([]);
  });

  it("uses named money-weighted performance only when external cash-flow timing is supplied", () => {
    const performance = computeFinanceInvestmentPerformance({ method: "MONEY_WEIGHTED", periodStart: "2026-01-01", periodEnd: "2026-12-31", beginningValue: { amountMinor: "1000000", currency: "CAD" }, endingValue: { amountMinor: "1100000", currency: "CAD" }, externalCashFlows: [{ date: "2026-07-02", amount: { amountMinor: "100000", currency: "CAD" }, kind: "CONTRIBUTION" }] });
    expect(performance.method).toBe("MONEY_WEIGHTED");
    expect(performance.returnRate).toBeGreaterThan(-1);
    expect(performance.assumptions.join(" ")).toContain("money-weighted");
    expect(() => computeFinanceInvestmentPerformance({ method: "TIME_WEIGHTED", periodStart: "2026-01-01", periodEnd: "2026-12-31", beginningValue: { amountMinor: "1000000", currency: "CAD" }, endingValue: { amountMinor: "1100000", currency: "CAD" }, externalCashFlows: [{ date: "2026-07-02", amount: { amountMinor: "100000", currency: "CAD" }, kind: "CONTRIBUTION" }] })).toThrow("sub-period valuations");
  });

  it("persists statement facts idempotently under the source identity", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-finance-facts`);
    await store.open();
    const commands = new CommandBus(store);
    const facts = parseFinanceStatementFactsCsv("StatementBalance,DueDate\n500.00,2026-02-15\n", source, "CREDIT_CARD");
    const first = await acceptFinanceStatementFacts(commands, source, facts);
    const second = await acceptFinanceStatementFacts(commands, source, facts);
    expect(second.id).toBe(first.id);
    expect((await store.list(true)).filter((record) => record.owner === "domain.finance" && record.data.kind === "finance-statement-facts")).toHaveLength(1);
    expect(first.data).toMatchObject({ kind: "finance-statement-facts", sourceId: source.sourceId, sourceClass: "CREDIT_CARD" });
    store.close();
  });

  it("accepts normalized rows through domain.finance once and reuses the same source-row owner", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-finance-import`);
    await store.open();
    const commands = new CommandBus(store);
    const transactions = parseFinanceCsv('Date,Description,Amount,Id\n2026-01-02,Cafe,-10.00,tx-1\n', source);
    const first = await acceptFinanceTransactions(commands, source, transactions);
    const second = await acceptFinanceTransactions(commands, source, transactions);
    expect(first).toMatchObject({ created: 1, existing: 0, duplicates: 0, conflicts: [] });
    expect(second).toMatchObject({ created: 0, existing: 1, duplicates: 0, conflicts: [] });
    expect((await store.list()).filter((record) => record.owner === "domain.finance")).toHaveLength(1);
    expect((await store.list())[0]?.data).toMatchObject({ kind: "finance-transaction", amountMinor: "-1000", sourceArtifactId: source.sourceId });
    store.close();
  });

  it("deduplicates a renamed or reformatted source against persisted natural identity", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-finance-overlap`);
    await store.open();
    const commands = new CommandBus(store);
    const original = parseFinanceCsv('Date,Description,Amount,Id\n2026-01-02,Cafe,-10.00,tx-1\n', source);
    const renamed = parseFinanceCsv('Date\tDescription\tAmount\tId\n2026-01-02\tCafe\t-10.00\ttx-1\n', { ...source, sourceId: "source:statement-renamed", name: "renamed.tsv", sha256: "b".repeat(64) });
    const first = await acceptFinanceTransactions(commands, source, original);
    const second = await acceptFinanceTransactions(commands, { ...source, sourceId: "source:statement-renamed", name: "renamed.tsv", sha256: "b".repeat(64) }, renamed);
    expect(first).toMatchObject({ created: 1, existing: 0 });
    expect(second).toMatchObject({ created: 0, existing: 1, conflicts: [] });
    expect((await store.list(true)).filter((record) => record.owner === "domain.finance")).toHaveLength(1);
    store.close();
  });

  it("corrects one imported value or classification once and preserves source lineage", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-finance-correction`);
    await store.open();
    const commands = new CommandBus(store);
    const transactions = parseFinanceCsv("Date,Description,Amount,Id\n2026-01-02,Cafe,-10.00,tx-correct\n", source);
    const imported = await acceptFinanceTransactions(commands, source, transactions);
    const original = imported.records[0];
    if (!original) throw new Error("Expected one imported transaction");
    const corrected = await correctFinanceTransaction(commands, original.id, { amount: "-12.00", essential: true }, original.revision);
    expect(corrected.revision).toBe(2);
    expect(corrected.provenance).toEqual(original.provenance);
    expect(corrected.data).toMatchObject({ amountMinor: "-1200", currency: "CAD", status: "CORRECTED", essential: true, sourceTransactionId: "tx-correct" });
    expect((await store.history(original.id)).map((entry) => entry.revision)).toEqual([1, 2]);
    await expect(correctFinanceTransaction(commands, original.id, { description: "Stale correction" }, original.revision)).rejects.toThrow("Canonical record changed");
    store.close();
  });

  it("accepts a bounded monthly batch once and returns per-source reconciliation exceptions", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-finance-batch`);
    await store.open();
    const commands = new CommandBus(store);
    const transactions = parseFinanceCsv("Date,Description,Amount,Id\n2026-01-02,Cafe,-10.00,tx-batch\n2026-01-03,Payroll,15.00,tx-pay\n", source);
    const facts = parseFinanceStatementFactsCsv("StatementBalance,DueDate,MinimumDue\n105.00,2026-02-15,25.00\n", source, "CREDIT_CARD");
    const entry = { source, transactions, statementFacts: facts };
    const first = await acceptFinanceBatch(commands, [entry]);
    expect(first).toMatchObject({ created: 2, existing: 0, duplicates: 0, conflicts: [] });
    expect(first.sourceResults).toMatchObject([{ sourceId: source.sourceId, reconciliation: { status: "MATCH" }, limitations: [] }]);
    expect(first.records).toHaveLength(3);
    const second = await acceptFinanceBatch(commands, [entry]);
    expect(second).toMatchObject({ created: 0, existing: 2, duplicates: 0, conflicts: [] });
    expect(second.sourceResults[0]?.reconciliation.status).toBe("MATCH");
    store.close();
  });
});
