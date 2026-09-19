import { describe, expect, it } from "vitest";
import { acceptFinanceTransactions, createFinanceSourceId, deduplicateFinanceTransactions, parseFinanceCsv, reconcileFinanceStatement, type FinanceStatementSource } from "./finance";
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
    const transactions = parseFinanceCsv('Date,Description,Debit,Credit,Id\n2026-01-02,"Cafe, Main",10.00,,tx-1\n2026-01-03,Payroll,,15.00,tx-2\n', source);
    expect(transactions).toHaveLength(2);
    expect(transactions[0]).toMatchObject({ amount: { amountMinor: "-1000", currency: "CAD" }, direction: "OUTFLOW", sourceTransactionId: "tx-1", lineage: { sourceId: source.sourceId, sourceSha256: source.sha256, sourceRow: 2, parserProfile: "CSV_HEADER_V1" } });
    expect(transactions[0]?.lineage.rawFields.description).toBe("Cafe, Main");
    expect(transactions[1]).toMatchObject({ amount: { amountMinor: "1500", currency: "CAD" }, direction: "INFLOW", sourceTransactionId: "tx-2", lineage: { sourceRow: 3 } });
  });

  it("does not carry credential-shaped source columns into durable lineage", () => {
    const [transaction] = parseFinanceCsv('Date,Description,Amount,Authorization\n2026-01-02,Cafe,-10.00,"Bearer never-store"\n', source);
    expect(transaction?.lineage.rawFields).not.toHaveProperty("authorization");
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
});
