import { addMoney, parseMoney, subtractMoney, type MoneyValue } from "./money";
import { SENSITIVE_KEY_PATTERN } from "./safety";
import type { CommandBus } from "./commands";
import type { CanonicalRecord } from "./model";

export const MAX_FINANCE_CSV_BYTES = 5 * 1024 * 1024;
export const MAX_FINANCE_ROWS = 10_000;

export type FinanceSourceClass = "TRANSACTION_ACCOUNT" | "CREDIT_CARD" | "INVESTMENT" | "DEBT" | "INCOME" | "INSURANCE" | "TAX_BENEFIT" | "RECEIPT" | "UNKNOWN";

export type FinanceTransactionStatus = "PENDING" | "POSTED" | "REVERSED" | "REFUNDED" | "VOIDED" | "CORRECTED" | "UNKNOWN";

export interface FinanceStatementSource {
  sourceId: string;
  name: string;
  sha256: string;
  accountId: string;
  currency: string;
  sourceClass?: FinanceSourceClass;
  sourceArtifactId?: string;
  openingBalance?: MoneyValue;
  closingBalance?: MoneyValue;
}

export interface FinanceInvestmentCashFlow {
  date: string;
  amount: MoneyValue;
  kind: "CONTRIBUTION" | "WITHDRAWAL" | "DISTRIBUTION" | "FEE";
  sourceRow?: number;
}

export interface FinanceInvestmentPerformanceInput {
  method: "TIME_WEIGHTED" | "MONEY_WEIGHTED";
  periodStart: string;
  periodEnd: string;
  beginningValue: MoneyValue;
  endingValue: MoneyValue;
  externalCashFlows: FinanceInvestmentCashFlow[];
}

export interface FinanceInvestmentPerformance {
  method: FinanceInvestmentPerformanceInput["method"];
  returnRate: number;
  periodDays: number;
  assumptions: string[];
  truthClass: "MODELED";
}

export interface FinanceStatementFacts {
  sourceId: string;
  sourceClass: "CREDIT_CARD" | "INVESTMENT" | "INSURANCE";
  periodStart?: string;
  periodEnd?: string;
  creditCard?: {
    statementBalance?: MoneyValue;
    dueDate?: string;
    minimumDue?: MoneyValue;
    gracePeriodDays?: number;
    interestTerms?: string;
    creditLimit?: MoneyValue;
    utilization?: number;
  };
  investment?: {
    valuation?: MoneyValue;
    valuationDate?: string;
    externalCashFlows: FinanceInvestmentCashFlow[];
    performance?: FinanceInvestmentPerformance;
  };
  insurance?: {
    premium?: MoneyValue;
    renewalAt?: string;
    expiryAt?: string;
    coveredAmount?: MoneyValue;
    deductible?: MoneyValue;
    beneficiary?: string;
    insuredSubject?: string;
  };
  evidence: { truthClass: "OBSERVED"; sourceIds: string[] };
  limitations: string[];
}

export interface FinanceRawRow {
  sourceRow: number;
  fields: Record<string, string>;
}

export interface FinanceLineage {
  sourceId: string;
  sourceSha256: string;
  sourceRow: number;
  parserProfile: "CSV_HEADER_V1" | "STRUCTURED_V1";
  rawFields: Record<string, string>;
}

export interface FinanceTransaction {
  id: string;
  accountId: string;
  postedAt: string;
  description: string;
  merchant: string;
  amount: MoneyValue;
  direction: "INFLOW" | "OUTFLOW" | "NEUTRAL";
  status: FinanceTransactionStatus;
  essential?: boolean;
  sourceTransactionId?: string;
  naturalKey: string;
  lineage: FinanceLineage;
}

export interface FinanceDeduplicationResult {
  unique: FinanceTransaction[];
  duplicates: FinanceTransaction[];
  conflicts: FinanceTransactionConflict[];
}

export interface FinanceTransactionConflict {
  sourceTransactionId: string;
  transactionIds: string[];
  reason: "SOURCE_ID_REUSED_WITH_DIFFERENT_MEANING";
}

export interface FinanceReconciliation {
  status: "MATCH" | "MISMATCH" | "INCOMPLETE";
  openingBalance?: MoneyValue;
  activity: MoneyValue;
  expectedClosingBalance?: MoneyValue;
  closingBalance?: MoneyValue;
  unexplainedDifference?: MoneyValue;
  includedTransactionIds: string[];
  excludedByStatus: Record<string, number>;
}

export interface FinanceImportResult {
  records: CanonicalRecord[];
  created: number;
  existing: number;
  duplicates: number;
  conflicts: FinanceTransactionConflict[];
}

export interface FinanceTransactionCorrection {
  amount?: string;
  description?: string;
  essential?: boolean | null;
}

export interface FinanceBatchEntry {
  source: FinanceStatementSource;
  transactions: FinanceTransaction[];
  statementFacts?: FinanceStatementFacts;
}

export interface FinanceBatchSourceResult {
  sourceId: string;
  import: FinanceImportResult;
  reconciliation: FinanceReconciliation;
  limitations: string[];
}

export interface FinanceBatchResult {
  records: CanonicalRecord[];
  sourceResults: FinanceBatchSourceResult[];
  created: number;
  existing: number;
  duplicates: number;
  conflicts: FinanceTransactionConflict[];
}

export function createFinanceSourceId(sourceSha256: string, accountId: string, currency: string): string {
  if (!/^[a-f0-9]{64}$/i.test(sourceSha256)) throw new Error("Finance source SHA-256 is required");
  const normalizedAccount = accountId.trim().slice(0, 160);
  if (!normalizedAccount) throw new Error("Finance account identity is required");
  const normalizedCurrency = parseMoney("0", currency).currency;
  return `finance-source:${sourceSha256.toLowerCase()}:${stableKey(`${normalizedAccount}|${normalizedCurrency}`)}`;
}

const headerAliases: Record<string, string> = {
  date: "postedAt",
  postdate: "postedAt",
  posted: "postedAt",
  posteddate: "postedAt",
  transactiondate: "postedAt",
  description: "description",
  memo: "description",
  payee: "description",
  merchant: "description",
  name: "description",
  amount: "amount",
  transactionamount: "amount",
  value: "amount",
  debit: "debit",
  withdrawal: "debit",
  outflow: "debit",
  credit: "credit",
  deposit: "credit",
  inflow: "credit",
  currency: "currency",
  curr: "currency",
  id: "sourceTransactionId",
  transactionid: "sourceTransactionId",
  fitid: "sourceTransactionId",
  reference: "sourceTransactionId",
  ref: "sourceTransactionId",
  status: "status",
  state: "status",
  essential: "essential",
  essentialexpense: "essential",
  necessity: "essential",
  category: "category"
};

export function parseFinanceCsv(text: string, source: FinanceStatementSource): FinanceTransaction[] {
  assertSource(source);
  if (new TextEncoder().encode(text).byteLength > MAX_FINANCE_CSV_BYTES) throw new Error("Finance statement exceeds the bounded 5 MiB CSV limit");
  const delimiter = detectDelimiter(text);
  const rows = parseDelimited(text, delimiter);
  const headerRow = rows.find((row) => row.values.some((value) => value.trim().length > 0));
  if (!headerRow) throw new Error("Finance statement has no header row");
  const headers = headerRow.values.map(normalizeHeader);
  if (headers.some((header) => !header) || new Set(headers).size !== headers.length) throw new Error("Finance statement headers must be non-empty and unique");
  if (!headers.includes("postedAt") || !headers.includes("description") || (!headers.includes("amount") && !headers.includes("debit") && !headers.includes("credit"))) {
    throw new Error("Finance statement requires date, description, and amount/debit/credit columns");
  }
  const dataRows = rows.slice(rows.indexOf(headerRow) + 1).filter((row) => row.values.some((value) => value.trim().length > 0));
  if (dataRows.length > MAX_FINANCE_ROWS) throw new Error(`Finance statement exceeds the bounded ${MAX_FINANCE_ROWS}-row limit`);
  const rawRows = mapDelimitedRows(dataRows, headers);
  return normalizeFinanceRows(rawRows, source, "CSV_HEADER_V1");
}

export function parseFinanceStatementFactsCsv(text: string, source: FinanceStatementSource, sourceClass: FinanceStatementFacts["sourceClass"]): FinanceStatementFacts {
  assertSource(source);
  if (new TextEncoder().encode(text).byteLength > MAX_FINANCE_CSV_BYTES) throw new Error("Finance statement exceeds the bounded 5 MiB CSV limit");
  const delimiter = detectDelimiter(text);
  const rows = parseDelimited(text, delimiter);
  const headerRow = rows.find((row) => row.values.some((value) => value.trim().length > 0));
  if (!headerRow) throw new Error("Finance statement has no header row");
  const headers = headerRow.values.map(normalizeHeader);
  if (headers.some((header) => !header) || new Set(headers).size !== headers.length) throw new Error("Finance statement headers must be non-empty and unique");
  const dataRows = rows.slice(rows.indexOf(headerRow) + 1).filter((row) => row.values.some((value) => value.trim().length > 0));
  if (dataRows.length > MAX_FINANCE_ROWS) throw new Error(`Finance statement exceeds the bounded ${MAX_FINANCE_ROWS}-row limit`);
  const rawRows = mapDelimitedRows(dataRows, headers);
  return extractStatementFactsFromRows(rawRows, source, sourceClass);
}

export function extractFinanceStatementFacts(transactions: readonly FinanceTransaction[], source: FinanceStatementSource, sourceClass: FinanceStatementFacts["sourceClass"]): FinanceStatementFacts {
  assertSource(source);
  return extractStatementFactsFromRows(transactions.map((transaction) => ({ sourceRow: transaction.lineage.sourceRow, fields: transaction.lineage.rawFields })), source, sourceClass);
}

export function computeFinanceInvestmentPerformance(input: FinanceInvestmentPerformanceInput): FinanceInvestmentPerformance {
  const start = Date.parse(input.periodStart);
  const end = Date.parse(input.periodEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error("Investment performance period is invalid");
  if (input.beginningValue.currency !== input.endingValue.currency || input.externalCashFlows.some((flow) => flow.amount.currency !== input.beginningValue.currency)) throw new Error("Investment performance values must use one currency");
  const beginning = Number(input.beginningValue.amountMinor) / 100;
  const ending = Number(input.endingValue.amountMinor) / 100;
  if (!Number.isFinite(beginning) || !Number.isFinite(ending) || beginning <= 0 || ending < 0) throw new Error("Investment performance values must be bounded and non-negative");
  const periodDays = Math.round((end - start) / 86_400_000);
  const periodYears = periodDays / 365;
  const assumptions = [`period ${input.periodStart} to ${input.periodEnd}`, "values are statement observations; performance is modeled", "tax, suitability, and future-return claims are out of scope"];
  if (input.method === "TIME_WEIGHTED") {
    if (input.externalCashFlows.length > 0) throw new Error("Time-weighted performance requires sub-period valuations around external cash flows");
    return { method: input.method, returnRate: ending / beginning - 1, periodDays, assumptions: [...assumptions, "no external cash flows were supplied; simple holding-period return is used"], truthClass: "MODELED" };
  }
  const cashFlows = [
    { years: 0, amount: -beginning },
    ...input.externalCashFlows.map((flow) => {
      const flowDate = Date.parse(flow.date);
      if (!Number.isFinite(flowDate) || flowDate < start || flowDate > end) throw new Error("Investment cash-flow date is outside the performance period");
      const amount = Number(flow.amount.amountMinor) / 100;
      if (!Number.isFinite(amount) || amount < 0) throw new Error("Investment cash-flow amount is invalid");
      const sign = flow.kind === "CONTRIBUTION" || flow.kind === "FEE" ? -1 : 1;
      return { years: (flowDate - start) / 86_400_000 / 365, amount: sign * amount };
    }),
    { years: periodYears, amount: ending }
  ];
  let rate = 0.05;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const base = 1 + rate;
    if (base <= 0) break;
    let value = 0;
    let derivative = 0;
    for (const flow of cashFlows) {
      const exponent = periodYears - flow.years;
      const powered = Math.pow(base, exponent);
      value += flow.amount * powered;
      derivative += exponent === 0 ? 0 : flow.amount * exponent * Math.pow(base, exponent - 1);
    }
    if (Math.abs(value) < 1e-8) return { method: input.method, returnRate: rate, periodDays, assumptions: [...assumptions, "external cash flows use money-weighted annualized IRR with actual/365 timing"], truthClass: "MODELED" };
    if (!Number.isFinite(derivative) || Math.abs(derivative) < 1e-12) break;
    const next = rate - value / derivative;
    if (!Number.isFinite(next) || next <= -0.9999 || next > 100) break;
    rate = next;
  }
  throw new Error("Investment money-weighted performance did not converge within the bounded solver");
}

function extractStatementFactsFromRows(rows: FinanceRawRow[], source: FinanceStatementSource, sourceClass: FinanceStatementFacts["sourceClass"]): FinanceStatementFacts {
  const limitations: string[] = [];
  const first = (...keys: string[]): string | undefined => {
    const normalizedKeys = keys.map((key) => key.replace(/[^a-z0-9]/giu, "").toLocaleLowerCase("en-CA"));
    for (const row of rows) for (const key of normalizedKeys) {
      const value = row.fields[key]?.trim();
      if (value) return value;
    }
    return undefined;
  };
  const readMoney = (label: string, ...keys: string[]): MoneyValue | undefined => {
    const value = first(...keys);
    if (!value) return undefined;
    try { return parseMoney(value, source.currency); } catch { limitations.push(`${label} is present but invalid`); return undefined; }
  };
  const readDate = (label: string, ...keys: string[]): string | undefined => {
    const value = first(...keys);
    if (!value) return undefined;
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) { limitations.push(`${label} is present but invalid`); return undefined; }
    return new Date(parsed).toISOString();
  };
  const periodStart = readDate("statement period start", "periodStart", "statementStart", "startDate");
  const periodEnd = readDate("statement period end", "periodEnd", "statementEnd", "endDate");
  const facts: FinanceStatementFacts = { sourceId: source.sourceId, sourceClass, ...(periodStart ? { periodStart } : {}), ...(periodEnd ? { periodEnd } : {}), evidence: { truthClass: "OBSERVED", sourceIds: [source.sourceId] }, limitations };
  if (sourceClass === "CREDIT_CARD") {
    const statementBalance = readMoney("statement balance", "statementBalance", "balanceOwed", "balance");
    const minimumDue = readMoney("minimum due", "minimumDue", "minimumPayment", "minPayment");
    const creditLimit = readMoney("credit limit", "creditLimit", "limit");
    const dueDate = readDate("payment due date", "dueDate", "paymentDueDate");
    const graceRaw = first("gracePeriodDays", "graceDays");
    const gracePeriodDays = graceRaw ? Number(graceRaw) : undefined;
    if (graceRaw && (gracePeriodDays === undefined || !Number.isInteger(gracePeriodDays) || gracePeriodDays < 0 || gracePeriodDays > 3650)) limitations.push("grace period is present but outside the supported range");
    const utilizationRaw = first("utilization", "utilizationRate");
    const parsedUtilization = utilizationRaw ? Number(utilizationRaw.replace(/%$/u, "")) / (utilizationRaw.endsWith("%") ? 100 : 1) : undefined;
    const utilization = parsedUtilization !== undefined && Number.isFinite(parsedUtilization) && parsedUtilization >= 0 && parsedUtilization <= 1 ? parsedUtilization : undefined;
    if (utilizationRaw && utilization === undefined) limitations.push("credit utilization is present but invalid");
    facts.creditCard = { ...(statementBalance ? { statementBalance } : {}), ...(dueDate ? { dueDate } : {}), ...(minimumDue ? { minimumDue } : {}), ...(gracePeriodDays !== undefined && Number.isInteger(gracePeriodDays) && gracePeriodDays >= 0 && gracePeriodDays <= 3650 ? { gracePeriodDays } : {}), ...(first("interestTerms", "interestRate", "apr") ? { interestTerms: first("interestTerms", "interestRate", "apr")!.slice(0, 240) } : {}), ...(creditLimit ? { creditLimit } : {}), ...(utilization !== undefined ? { utilization } : {}) };
    if (facts.creditCard.statementBalance && facts.creditCard.creditLimit && facts.creditCard.utilization === undefined && BigInt(facts.creditCard.creditLimit.amountMinor) > 0n) facts.creditCard.utilization = Number(BigInt(facts.creditCard.statementBalance.amountMinor)) / Number(BigInt(facts.creditCard.creditLimit.amountMinor));
  } else if (sourceClass === "INVESTMENT") {
    const externalCashFlows: FinanceInvestmentCashFlow[] = [];
    for (const row of rows) {
      const amountText = row.fields.externalcashflow || row.fields.cashflow || row.fields.flowamount;
      if (!amountText) continue;
      let amount: MoneyValue;
      try { amount = parseMoney(amountText, source.currency); } catch { limitations.push(`investment cash flow row ${row.sourceRow} is invalid`); continue; }
      const dateText = row.fields.cashflowdate || row.fields.postedat || row.fields.date;
      const date = dateText && Number.isFinite(Date.parse(dateText)) ? new Date(Date.parse(dateText)).toISOString() : undefined;
      const kindText = (row.fields.cashflowtype || row.fields.flowtype || "CONTRIBUTION").toUpperCase().replace(/[ -]+/g, "_");
      const kind = kindText === "WITHDRAWAL" || kindText === "DISTRIBUTION" || kindText === "FEE" ? kindText : "CONTRIBUTION";
      if (date) externalCashFlows.push({ date, amount, kind, sourceRow: row.sourceRow });
      else limitations.push(`investment cash flow row ${row.sourceRow} has no valid date`);
    }
    const valuation = readMoney("investment valuation", "valuation", "marketValue", "accountValue", "endingValue");
    const valuationDate = readDate("investment valuation date", "valuationDate", "asOfDate");
    const methodText = first("performanceMethod", "returnMethod")?.toUpperCase().replace(/[ -]+/g, "_");
    const method = methodText === "TIME_WEIGHTED" ? "TIME_WEIGHTED" : methodText === "MONEY_WEIGHTED" ? "MONEY_WEIGHTED" : undefined;
    const beginningValue = readMoney("investment beginning value", "beginningValue", "openingValue");
    const endingValue = readMoney("investment ending value", "endingValue", "closingValue", "valuation", "marketValue");
    let performance: FinanceInvestmentPerformance | undefined;
    if (method && periodStart && periodEnd && beginningValue && endingValue) {
      try { performance = computeFinanceInvestmentPerformance({ method, periodStart, periodEnd, beginningValue, endingValue, externalCashFlows }); } catch (error) { limitations.push(error instanceof Error ? error.message : "investment performance could not be computed"); }
    } else if (valuation || externalCashFlows.length > 0) limitations.push("investment performance is withheld until a named method, period, valuation, and compatible cash-flow evidence are supplied");
    facts.investment = { externalCashFlows, ...(valuation ? { valuation } : {}), ...(valuationDate ? { valuationDate } : {}), ...(performance ? { performance } : {}) };
  } else {
    const premium = readMoney("insurance premium", "premium", "annualPremium");
    const renewalAt = readDate("insurance renewal date", "renewalDate", "renewalAt");
    const expiryAt = readDate("insurance expiry date", "expiryDate", "expiryAt");
    const coveredAmount = readMoney("insurance covered amount", "coveredAmount", "coverageLimit", "limit");
    const deductible = readMoney("insurance deductible", "deductible");
    facts.insurance = { ...(premium ? { premium } : {}), ...(renewalAt ? { renewalAt } : {}), ...(expiryAt ? { expiryAt } : {}), ...(coveredAmount ? { coveredAmount } : {}), ...(deductible ? { deductible } : {}), ...(first("beneficiary") ? { beneficiary: first("beneficiary")!.slice(0, 240) } : {}), ...(first("insuredSubject", "subject") ? { insuredSubject: first("insuredSubject", "subject")!.slice(0, 240) } : {}) };
  }
  facts.limitations = [...new Set(limitations)].sort();
  return facts;
}

export function normalizeFinanceRows(rows: FinanceRawRow[], source: FinanceStatementSource, parserProfile: FinanceLineage["parserProfile"] = "STRUCTURED_V1"): FinanceTransaction[] {
  assertSource(source);
  if (rows.length > MAX_FINANCE_ROWS) throw new Error(`Finance statement exceeds the bounded ${MAX_FINANCE_ROWS}-row limit`);
  const sourceCurrency = parseMoney("0", source.currency).currency;
  return rows.map((row) => {
    if (!Number.isSafeInteger(row.sourceRow) || row.sourceRow < 1) throw new Error("Finance source row number is invalid");
    const fields = Object.fromEntries(Object.entries(row.fields).filter(([key]) => !SENSITIVE_KEY_PATTERN.test(key)).map(([key, value]) => [key, String(value).slice(0, 2000)]));
    const postedAt = parsePostedAt(readField(fields, "postedAt"), row.sourceRow);
    const description = readField(fields, "description").slice(0, 500);
    if (!description) throw new Error(`Finance row ${row.sourceRow} has no description`);
    const currency = parseMoney("0", readField(fields, "currency") || sourceCurrency).currency;
    const amount = parseRowAmount(fields, currency, row.sourceRow);
    const status = normalizeStatus(readField(fields, "status"));
    const classification = `${readField(fields, "essential")} ${readField(fields, "category")}`.toLocaleLowerCase("en-CA");
    const essential = /(^|[\s_-])(true|yes|essential|fixed-essential)(?=$|[\s_-])/u.test(classification);
    const merchant = normalizeMerchant(description);
    const sourceTransactionId = readField(fields, "sourceTransactionId");
    const naturalKey = `${source.accountId}|${postedAt.slice(0, 10)}|${amount.currency}|${amount.amountMinor}|${merchant}`;
    const id = `finance:transaction:${stableKey(naturalKey)}`;
    return {
      id,
      accountId: source.accountId,
      postedAt,
      description,
      merchant,
      amount,
      direction: BigInt(amount.amountMinor) > 0n ? "INFLOW" : BigInt(amount.amountMinor) < 0n ? "OUTFLOW" : "NEUTRAL",
      status,
      ...(essential ? { essential: true } : {}),
      ...(sourceTransactionId ? { sourceTransactionId: sourceTransactionId.slice(0, 200) } : {}),
      naturalKey,
      lineage: { sourceId: source.sourceId, sourceSha256: source.sha256, sourceRow: row.sourceRow, parserProfile, rawFields: fields }
    } satisfies FinanceTransaction;
  });
}

export function deduplicateFinanceTransactions(transactions: FinanceTransaction[]): FinanceDeduplicationResult {
  const unique: FinanceTransaction[] = [];
  const duplicates: FinanceTransaction[] = [];
  const conflicts: FinanceTransactionConflict[] = [];
  const byNaturalKey = new Map<string, FinanceTransaction>();
  const bySourceId = new Map<string, FinanceTransaction>();
  for (const transaction of transactions) {
    const sourceKey = transaction.sourceTransactionId ? `${transaction.accountId}|${transaction.sourceTransactionId}` : undefined;
    const priorSource = sourceKey ? bySourceId.get(sourceKey) : undefined;
    if (priorSource && priorSource.naturalKey !== transaction.naturalKey) {
      unique.push(transaction);
      conflicts.push({ sourceTransactionId: transaction.sourceTransactionId ?? "", transactionIds: [priorSource.id, transaction.id], reason: "SOURCE_ID_REUSED_WITH_DIFFERENT_MEANING" });
      continue;
    }
    const priorNatural = byNaturalKey.get(transaction.naturalKey);
    if (priorNatural) {
      duplicates.push(transaction);
      continue;
    }
    unique.push(transaction);
    byNaturalKey.set(transaction.naturalKey, transaction);
    if (sourceKey) bySourceId.set(sourceKey, transaction);
  }
  return { unique, duplicates, conflicts };
}

export async function acceptFinanceTransactions(commands: CommandBus, source: FinanceStatementSource, transactions: FinanceTransaction[]): Promise<FinanceImportResult> {
  assertSource(source);
  const deduplicated = deduplicateFinanceTransactions(transactions);
  const records: CanonicalRecord[] = [];
  let created = 0;
  let existing = 0;
  const conflicts = [...deduplicated.conflicts];
  const existingFinance = (await commands.list(true)).filter((record) => record.owner === "domain.finance" && record.data.kind === "finance-transaction");
  const byNaturalKey = new Map<string, CanonicalRecord>(existingFinance.flatMap((record) => typeof record.data.naturalKey === "string" ? [[record.data.naturalKey, record] as const] : []));
  const bySourceKey = new Map<string, CanonicalRecord>(existingFinance.flatMap((record) => typeof record.data.accountId === "string" && typeof record.data.sourceTransactionId === "string" ? [[`${record.data.accountId}|${record.data.sourceTransactionId}`, record] as const] : []));
  const byProvenance = new Map<string, CanonicalRecord>(existingFinance.flatMap((record) => record.provenance.sourceId ? [[record.provenance.sourceId, record] as const] : []));
  const addConflict = (transaction: FinanceTransaction, prior: CanonicalRecord): void => {
    if (!transaction.sourceTransactionId || typeof prior.data.sourceTransactionId !== "string") return;
    const transactionIds = [String(prior.data.id ?? prior.id), transaction.id].sort();
    if (!conflicts.some((conflict) => conflict.sourceTransactionId === transaction.sourceTransactionId && conflict.transactionIds.slice().sort().join("|") === transactionIds.join("|"))) {
      conflicts.push({ sourceTransactionId: transaction.sourceTransactionId, transactionIds, reason: "SOURCE_ID_REUSED_WITH_DIFFERENT_MEANING" });
    }
  };
  for (const transaction of deduplicated.unique) {
    const provenanceId = `${source.sourceId}:row:${transaction.lineage.sourceRow}`;
    const prior = byProvenance.get(provenanceId);
    if (prior) {
      records.push(prior);
      existing += 1;
      continue;
    }
    const sourceKey = transaction.sourceTransactionId ? `${transaction.accountId}|${transaction.sourceTransactionId}` : undefined;
    const priorSource = sourceKey ? bySourceKey.get(sourceKey) : undefined;
    const priorNatural = byNaturalKey.get(transaction.naturalKey);
    if (priorSource && priorSource.data.naturalKey !== transaction.naturalKey) addConflict(transaction, priorSource);
    if (priorNatural && (!priorSource || priorSource.data.naturalKey === transaction.naturalKey)) {
      records.push(priorNatural);
      existing += 1;
      continue;
    }
    const record = await commands.create({
      recordType: "observation",
      owner: "domain.finance",
      truthClass: "IMPORTED_RECORD",
      provenance: { source: "IMPORT", sourceId: provenanceId },
      data: {
        text: `${transaction.merchant}: ${transaction.amount.amountMinor} ${transaction.amount.currency} minor units`,
        kind: "finance-transaction",
        accountId: transaction.accountId,
        postedAt: transaction.postedAt,
        description: transaction.description,
        merchant: transaction.merchant,
        amountMinor: transaction.amount.amountMinor,
        currency: transaction.amount.currency,
        direction: transaction.direction,
        status: transaction.status,
        ...(transaction.essential ? { essential: true } : {}),
        naturalKey: transaction.naturalKey,
        sourceArtifactId: source.sourceArtifactId ?? source.sourceId,
        sourceTransactionId: transaction.sourceTransactionId,
        financeLineage: transaction.lineage,
        ...(conflicts.some((conflict) => conflict.transactionIds.includes(transaction.id)) || (priorSource && priorSource.data.naturalKey !== transaction.naturalKey) ? { reviewRequired: true, reviewReason: "source transaction identifier was reused with a different meaning" } : {})
      }
    });
    records.push(record);
    created += 1;
    byNaturalKey.set(transaction.naturalKey, record);
    if (sourceKey) bySourceKey.set(sourceKey, record);
    byProvenance.set(provenanceId, record);
  }
  return { records, created, existing, duplicates: deduplicated.duplicates.length, conflicts };
}

/** Accept a bounded monthly batch through the same per-source canonical owner. */
export async function acceptFinanceBatch(commands: CommandBus, entries: readonly FinanceBatchEntry[]): Promise<FinanceBatchResult> {
  if (entries.length === 0 || entries.length > 32) throw new Error("Finance batch must contain between 1 and 32 sources");
  const sourceIds = entries.map((entry) => entry.source.sourceId);
  if (new Set(sourceIds).size !== sourceIds.length) throw new Error("Finance batch source identities must be unique");
  const records: CanonicalRecord[] = [];
  const sourceResults: FinanceBatchSourceResult[] = [];
  const conflicts: FinanceTransactionConflict[] = [];
  let created = 0;
  let existing = 0;
  let duplicates = 0;
  for (const entry of [...entries].sort((left, right) => left.source.sourceId.localeCompare(right.source.sourceId))) {
    const factRecord = entry.statementFacts ? await acceptFinanceStatementFacts(commands, entry.source, entry.statementFacts) : undefined;
    const imported = await acceptFinanceTransactions(commands, entry.source, entry.transactions);
    const reconciliation = reconcileFinanceStatement(entry.source, entry.transactions);
    const limitations = [
      ...(entry.statementFacts?.limitations ?? []),
      ...imported.conflicts.map((conflict) => `source transaction ${conflict.sourceTransactionId} has conflicting meanings`),
      ...(reconciliation.status === "MATCH" ? [] : [`statement reconciliation is ${reconciliation.status.toLowerCase()}`])
    ];
    if (factRecord) records.push(factRecord);
    records.push(...imported.records);
    sourceResults.push({ sourceId: entry.source.sourceId, import: imported, reconciliation, limitations: [...new Set(limitations)].sort() });
    created += imported.created;
    existing += imported.existing;
    duplicates += imported.duplicates;
    conflicts.push(...imported.conflicts);
  }
  return { records, sourceResults, created, existing, duplicates, conflicts };
}

/** Apply one explicit user correction through the canonical Finance owner. */
export async function correctFinanceTransaction(commands: CommandBus, recordId: string, correction: FinanceTransactionCorrection, expectedRevision?: number): Promise<CanonicalRecord> {
  const current = await commands.get(recordId, true);
  if (!current || current.deleted || current.owner !== "domain.finance" || current.data.kind !== "finance-transaction") throw new Error("Only an active canonical Finance transaction can be corrected");
  const fields = [
    correction.amount !== undefined ? "amount" : undefined,
    correction.description !== undefined ? "description" : undefined,
    correction.essential !== undefined ? "essential" : undefined
  ].filter((field): field is string => field !== undefined);
  if (fields.length === 0) throw new Error("At least one Finance correction is required");
  const currency = typeof current.data.currency === "string" ? parseMoney("0", current.data.currency).currency : undefined;
  if (!currency) throw new Error("Finance transaction currency is missing");
  const currentMinor = typeof current.data.amountMinor === "string" ? BigInt(current.data.amountMinor) : undefined;
  if (currentMinor === undefined) throw new Error("Finance transaction amount is missing");
  const amount = correction.amount === undefined ? moneyFromMinor(currentMinor, currency) : parseMoney(correction.amount, currency);
  const priorDescription = typeof current.data.description === "string" ? current.data.description : typeof current.data.text === "string" ? current.data.text : "";
  const description = correction.description === undefined ? priorDescription : correction.description.trim().slice(0, 500);
  if (!description) throw new Error("Finance transaction description is required");
  const merchant = normalizeMerchant(description);
  const accountId = typeof current.data.accountId === "string" && current.data.accountId.trim() ? current.data.accountId : "captured-expenses";
  const postedAt = typeof current.data.postedAt === "string" && Number.isFinite(Date.parse(current.data.postedAt)) ? new Date(current.data.postedAt).toISOString() : current.modifiedAt;
  const naturalKey = `${accountId}|${postedAt.slice(0, 10)}|${amount.currency}|${amount.amountMinor}|${merchant}`;
  const { essential: _previousEssential, ...dataWithoutEssential } = current.data;
  const essential = correction.essential === undefined ? current.data.essential === true : correction.essential === true;
  const direction = BigInt(amount.amountMinor) > 0n ? "INFLOW" : BigInt(amount.amountMinor) < 0n ? "OUTFLOW" : "NEUTRAL";
  return commands.update(recordId, {
    ...dataWithoutEssential,
    text: `${merchant}: ${amount.amountMinor} ${amount.currency} minor units`,
    description,
    merchant,
    amountMinor: amount.amountMinor,
    currency: amount.currency,
    direction,
    naturalKey,
    status: "CORRECTED",
    ...(essential ? { essential: true } : {}),
    correction: { previousRevision: current.revision, fields, correctedAt: new Date().toISOString() }
  }, expectedRevision ?? current.revision);
}

export async function acceptFinanceStatementFacts(commands: CommandBus, source: FinanceStatementSource, facts: FinanceStatementFacts): Promise<CanonicalRecord> {
  assertSource(source);
  const existing = (await commands.list(true)).find((record) => !record.deleted && record.owner === "domain.finance" && record.data.kind === "finance-statement-facts" && record.data.sourceId === source.sourceId);
  if (existing) return existing;
  return commands.create({
    recordType: "observation",
    owner: "domain.finance",
    truthClass: "IMPORTED_RECORD",
    provenance: { source: "IMPORT", sourceId: source.sourceId },
    data: {
      text: `${facts.sourceClass} statement facts: ${source.name}`.slice(0, 500),
      kind: "finance-statement-facts",
      sourceId: source.sourceId,
      sourceClass: facts.sourceClass,
      sourceArtifactId: source.sourceArtifactId ?? source.sourceId,
      statementFacts: facts
    }
  });
}

export function reconcileFinanceStatement(source: FinanceStatementSource, transactions: FinanceTransaction[]): FinanceReconciliation {
  assertSource(source);
  const currency = parseMoney("0", source.currency).currency;
  const included = transactions.filter((transaction) => transaction.accountId === source.accountId && transaction.amount.currency === currency && transaction.status !== "PENDING" && transaction.status !== "VOIDED" && transaction.status !== "UNKNOWN");
  const excludedByStatus: Record<string, number> = {};
  for (const transaction of transactions) {
    if (!included.includes(transaction)) excludedByStatus[transaction.status] = (excludedByStatus[transaction.status] ?? 0) + 1;
  }
  const activity = included.reduce((total, transaction) => addMoney(total, transaction.amount), parseMoney("0", currency));
  const result: FinanceReconciliation = { status: "INCOMPLETE", ...(source.openingBalance ? { openingBalance: source.openingBalance } : {}), activity, ...(source.closingBalance ? { closingBalance: source.closingBalance } : {}), includedTransactionIds: included.map((transaction) => transaction.id), excludedByStatus };
  if (!source.openingBalance || !source.closingBalance) return result;
  const expectedClosingBalance = addMoney(source.openingBalance, activity);
  const unexplainedDifference = subtractMoney(source.closingBalance, expectedClosingBalance);
  return { ...result, status: unexplainedDifference.amountMinor === "0" ? "MATCH" : "MISMATCH", expectedClosingBalance, unexplainedDifference };
}

function assertSource(source: FinanceStatementSource): void {
  if (!source.sourceId.trim() || !source.name.trim() || !source.accountId.trim()) throw new Error("Finance source identity is required");
  if (!/^[a-f0-9]{64}$/i.test(source.sha256)) throw new Error("Finance source SHA-256 is required");
  parseMoney("0", source.currency);
  if (source.openingBalance && source.openingBalance.currency !== parseMoney("0", source.currency).currency) throw new Error("Finance opening balance currency does not match the source");
  if (source.closingBalance && source.closingBalance.currency !== parseMoney("0", source.currency).currency) throw new Error("Finance closing balance currency does not match the source");
}

function parseRowAmount(fields: Record<string, string>, currency: string, sourceRow: number): MoneyValue {
  const amount = readField(fields, "amount");
  if (amount) return parseMoney(amount, currency);
  const debit = readField(fields, "debit");
  const credit = readField(fields, "credit");
  if (!debit && !credit) throw new Error(`Finance row ${sourceRow} has no amount`);
  const debitMinor = debit ? absMinor(parseMoney(debit, currency).amountMinor) : 0n;
  const creditMinor = credit ? absMinor(parseMoney(credit, currency).amountMinor) : 0n;
  return moneyFromMinor(creditMinor - debitMinor, currency);
}

function absMinor(value: string): bigint {
  const minor = BigInt(value);
  return minor < 0n ? -minor : minor;
}

function moneyFromMinor(amountMinor: bigint, currency: string): MoneyValue {
  if (amountMinor < -(2n ** 63n) || amountMinor > 2n ** 63n - 1n) throw new Error("Money amount is outside the supported range");
  return { amountMinor: amountMinor.toString(), currency };
}

function normalizeStatus(value: string): FinanceTransactionStatus {
  const normalized = value.trim().toUpperCase().replace(/[ -]+/g, "_");
  if (!normalized) return "POSTED";
  if (normalized === "PENDING" || normalized === "POSTED" || normalized === "REVERSED" || normalized === "REFUNDED" || normalized === "VOIDED" || normalized === "CORRECTED") return normalized;
  return "UNKNOWN";
}

function normalizeMerchant(value: string): string {
  return value.toLocaleLowerCase("en-CA").replace(/\s+/g, " ").trim();
}

function readField(fields: Record<string, string>, key: string): string {
  return fields[key]?.trim() ?? "";
}

function parsePostedAt(value: string, sourceRow: number): string {
  if (!value) throw new Error(`Finance row ${sourceRow} has no date`);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`Finance row ${sourceRow} has an invalid date`);
  return new Date(timestamp).toISOString();
}

function normalizeHeader(value: string): string {
  const normalized = value.replace(/^\uFEFF/, "").toLocaleLowerCase("en-CA").replace(/[^a-z0-9]/g, "");
  return headerAliases[normalized] ?? normalized.slice(0, 80);
}

function stableKey(value: string): string {
  let hash = 14695981039346656037n;
  for (const character of value) hash = BigInt.asUintN(64, (hash ^ BigInt(character.charCodeAt(0))) * 1099511628211n);
  return hash.toString(16).padStart(16, "0");
}

function detectDelimiter(text: string): "," | "\t" {
  const firstLine = text.split(/\r?\n/u, 1)[0] ?? "";
  return (firstLine.match(/\t/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? "\t" : ",";
}

function mapDelimitedRows(rows: Array<{ sourceRow: number; values: string[] }>, headers: string[]): FinanceRawRow[] {
  return rows.map((row) => {
    const overflow = row.values.slice(headers.length);
    if (overflow.some((value) => value.trim().length > 0)) throw new Error(`Finance row ${row.sourceRow} has more fields than its header`);
    return { sourceRow: row.sourceRow, fields: Object.fromEntries(headers.map((header, index) => [header, row.values[index]?.trim() ?? ""])) };
  });
}

function parseDelimited(text: string, delimiter: "," | "\t"): Array<{ sourceRow: number; values: string[] }> {
  const rows: Array<{ sourceRow: number; values: string[] }> = [];
  let values: string[] = [];
  let value = "";
  let quoted = false;
  let row = 1;
  let rowStart = 1;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (!quoted && character === delimiter) {
      values.push(value);
      value = "";
    } else if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      values.push(value);
      rows.push({ sourceRow: rowStart, values });
      values = [];
      value = "";
      row += 1;
      rowStart = row;
    } else value += character;
  }
  if (value || values.length > 0) {
    values.push(value);
    rows.push({ sourceRow: rowStart, values });
  }
  if (quoted) throw new Error("Finance statement contains an unterminated quoted field");
  return rows;
}
