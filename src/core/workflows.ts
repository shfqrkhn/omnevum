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
