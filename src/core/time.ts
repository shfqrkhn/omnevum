import type { CanonicalRecord } from "./model";

export type DeliveryClass = "IN_APP" | "ACTIVE_NOTIFICATION" | "OPPORTUNISTIC_BACKGROUND" | "EXTERNAL_COMPANION" | "UNAVAILABLE";
export type ReminderState = "UPCOMING" | "DUE" | "MISSED" | "COMPLETED" | "INVALID";

export interface ReminderData {
  kind: "reminder";
  title: string;
  dueAt: string;
  deliveryClass: DeliveryClass;
  status: "OPEN" | "DONE";
  recurrence?: { intervalMinutes: number; count?: number };
  lastReconciledAt?: string;
}

export function isReminder(record: CanonicalRecord): boolean {
  return record.data.kind === "reminder";
}

export function reminderState(record: CanonicalRecord, now = new Date()): ReminderState {
  if (!isReminder(record)) return "INVALID";
  if (record.data.status === "DONE") return "COMPLETED";
  const dueAt = typeof record.data.dueAt === "string" ? Date.parse(record.data.dueAt) : Number.NaN;
  if (!Number.isFinite(dueAt)) return "INVALID";
  return dueAt <= now.getTime() ? "DUE" : "UPCOMING";
}

export interface ReminderReconciliation {
  recordId: string;
  state: ReminderState;
  deliveryClass: DeliveryClass;
  reason: "NOT_DUE" | "DUE_ON_RESUME" | "MISSED_BACKGROUND_DELIVERY" | "COMPLETED" | "INVALID";
}

export function reconcileReminders(records: CanonicalRecord[], now = new Date()): ReminderReconciliation[] {
  return records.filter(isReminder).map((record) => {
    const state = reminderState(record, now);
    const deliveryClass = isDeliveryClass(record.data.deliveryClass) ? record.data.deliveryClass : "UNAVAILABLE";
    const reason = state === "UPCOMING" ? "NOT_DUE" : state === "COMPLETED" ? "COMPLETED" : state === "INVALID" ? "INVALID" : deliveryClass === "IN_APP" || deliveryClass === "UNAVAILABLE" ? "DUE_ON_RESUME" : "MISSED_BACKGROUND_DELIVERY";
    return { recordId: record.id, state, deliveryClass, reason };
  });
}

export function makeReminderData(title: string, dueAt: string, deliveryClass: DeliveryClass = "IN_APP"): ReminderData {
  if (!title.trim()) throw new Error("Reminder title is required");
  if (!Number.isFinite(Date.parse(dueAt))) throw new Error("Reminder due time is invalid");
  return { kind: "reminder", title: title.trim().slice(0, 240), dueAt, deliveryClass, status: "OPEN" };
}

function isDeliveryClass(value: unknown): value is DeliveryClass {
  return value === "IN_APP" || value === "ACTIVE_NOTIFICATION" || value === "OPPORTUNISTIC_BACKGROUND" || value === "EXTERNAL_COMPANION" || value === "UNAVAILABLE";
}
