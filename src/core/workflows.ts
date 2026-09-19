import type { CommandBus } from "./commands";
import type { CanonicalRecord } from "./model";
import type { SpaceId } from "./domain";
import { parseMoney } from "./money";

export interface ExpenseInput {
  merchant: string;
  amount: string | number;
  currency: string;
  space: SpaceId;
  subjectId?: string;
}

export interface HealthMeasurementInput {
  metric: string;
  value: number;
  unit?: string;
  space: SpaceId;
  subjectId: string;
  note?: string;
}

export async function captureExpense(commands: CommandBus, input: ExpenseInput): Promise<CanonicalRecord> {
  const merchant = input.merchant.trim().slice(0, 160);
  if (!merchant) throw new Error("Expense merchant is required");
  const money = parseMoney(input.amount, input.currency);
  return commands.create({
    recordType: "observation",
    owner: "domain.finance",
    truthClass: "USER_OBSERVATION",
    data: { kind: "expense", text: `${merchant}: ${money.amountMinor} ${money.currency} minor units`, merchant, amountMinor: money.amountMinor, currency: money.currency, space: input.space, ...(input.subjectId?.trim() ? { subjectId: input.subjectId.trim().slice(0, 160) } : {}), triageStatus: "REVIEWED" }
  });
}

export interface FinancePlanInput {
  kind: "resource" | "goal";
  label: string;
  amount: string;
  currency: string;
  space: SpaceId;
  targetDate?: string;
  sustainableMonthlySurplus?: string;
  hardConstraint?: boolean;
}

/** Persist a bounded Finance resource or goal through the shared command owner. */
export async function captureFinancePlan(commands: CommandBus, input: FinancePlanInput): Promise<CanonicalRecord> {
  const label = input.label.trim().slice(0, 160);
  if (!label) throw new Error("Finance plan label is required");
  const amount = parseMoney(input.amount, input.currency);
  if (BigInt(amount.amountMinor) < 0n) throw new Error("Finance plan amount cannot be negative");
  if (input.kind === "resource") {
    return commands.create({
      recordType: "observation",
      owner: "domain.finance",
      truthClass: "USER_OBSERVATION",
      data: { kind: "finance-resource", label, text: `${label}: ${amount.amountMinor} ${amount.currency} minor units`, amountMinor: amount.amountMinor, currency: amount.currency, space: input.space, triageStatus: "REVIEWED" }
    });
  }
  const targetDate = input.targetDate?.trim();
  if (targetDate && (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || !Number.isFinite(new Date(`${targetDate}T00:00:00.000Z`).getTime()))) throw new Error("Finance goal target date is invalid");
  const sustainableMonthlySurplus = input.sustainableMonthlySurplus?.trim() ? parseMoney(input.sustainableMonthlySurplus.trim(), input.currency) : undefined;
  if (sustainableMonthlySurplus && BigInt(sustainableMonthlySurplus.amountMinor) < 0n) throw new Error("Finance goal monthly surplus cannot be negative");
  return commands.create({
    recordType: "observation",
    owner: "domain.finance",
    truthClass: "ASSUMPTION",
    data: {
      kind: "finance-goal",
      label,
      text: `${label}: target ${amount.amountMinor} ${amount.currency} minor units`,
      targetAmountMinor: amount.amountMinor,
      currency: amount.currency,
      space: input.space,
      ...(targetDate ? { targetDate } : {}),
      ...(sustainableMonthlySurplus ? { sustainableMonthlySurplusMinor: sustainableMonthlySurplus.amountMinor } : {}),
      ...(input.hardConstraint === true ? { hardConstraint: true } : {}),
      triageStatus: "REVIEWED"
    }
  });
}

export async function captureHealthMeasurement(commands: CommandBus, input: HealthMeasurementInput): Promise<CanonicalRecord> {
  const metric = input.metric.trim().slice(0, 160);
  const subjectId = input.subjectId.trim().slice(0, 160);
  if (!metric) throw new Error("Health metric is required");
  if (!subjectId) throw new Error("Health subject identity is required");
  if (!Number.isFinite(input.value)) throw new Error("Health measurement must be finite");
  const unit = input.unit?.trim().slice(0, 40);
  return commands.create({
    recordType: "observation",
    owner: "domain.health",
    subjectId,
    truthClass: "USER_OBSERVATION",
    data: { kind: "health-measurement", text: input.note?.trim() || `${metric}: ${input.value}${unit ? ` ${unit}` : ""}`, metric, value: input.value, ...(unit ? { unit } : {}), space: input.space, subjectId, triageStatus: "REVIEWED" }
  });
}
