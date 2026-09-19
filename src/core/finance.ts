import { addMoney, parseMoney, subtractMoney, type MoneyValue } from "./money";
import { SENSITIVE_KEY_PATTERN } from "./safety";
import type { CommandBus } from "./commands";
import type { CanonicalRecord } from "./model";

export const MAX_FINANCE_CSV_BYTES = 5 * 1024 * 1024;
export const MAX_FINANCE_ROWS = 10_000;

export type FinanceTransactionStatus = "PENDING" | "POSTED" | "REVERSED" | "REFUNDED" | "VOIDED" | "CORRECTED" | "UNKNOWN";

export interface FinanceStatementSource {
  sourceId: string;
  name: string;
  sha256: string;
  accountId: string;
  currency: string;
  sourceArtifactId?: string;
  openingBalance?: MoneyValue;
  closingBalance?: MoneyValue;
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
  state: "status"
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
  const rawRows = rows.slice(rows.indexOf(headerRow) + 1)
    .filter((row) => row.values.some((value) => value.trim().length > 0))
    .slice(0, MAX_FINANCE_ROWS)
    .map((row) => ({ sourceRow: row.sourceRow, fields: Object.fromEntries(headers.map((header, index) => [header, row.values[index]?.trim() ?? ""])) }));
  if (rows.slice(rows.indexOf(headerRow) + 1).filter((row) => row.values.some((value) => value.trim().length > 0)).length > MAX_FINANCE_ROWS) throw new Error(`Finance statement exceeds the bounded ${MAX_FINANCE_ROWS}-row limit`);
  return normalizeFinanceRows(rawRows, source, "CSV_HEADER_V1");
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
