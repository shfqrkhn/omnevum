import type { CanonicalRecord } from "./model";
import { reconcileReminders, type DeliveryClass, type ReminderState } from "./time";

export const MAX_HOME_CONSIDERATIONS = 5;

export interface HomeConsideration {
  recordId: string;
  title: string;
  dueAt: string;
  deliveryClass: DeliveryClass;
  reason: "DUE_ON_RESUME" | "MISSED_BACKGROUND_DELIVERY";
  state: Extract<ReminderState, "DUE">;
  evidenceCount: 1;
  uncertainty: "UNKNOWN";
}

export function projectDueReminderConsiderations(records: CanonicalRecord[], now = new Date()): HomeConsideration[] {
  const recordsById = new Map(records.map((record) => [record.id, record]));
  return reconcileReminders(records, now)
    .filter((reminder) => reminder.state === "DUE")
    .flatMap((reminder) => {
      const record = recordsById.get(reminder.recordId);
      if (!record || reminder.reason === "INVALID" || (reminder.reason !== "DUE_ON_RESUME" && reminder.reason !== "MISSED_BACKGROUND_DELIVERY")) return [];
      const dueAt = typeof record.data.dueAt === "string" ? record.data.dueAt : "";
      if (!dueAt) return [];
      return [{
        recordId: record.id,
        title: typeof record.data.title === "string" && record.data.title.trim() ? record.data.title.trim() : record.id,
        dueAt,
        deliveryClass: reminder.deliveryClass,
        reason: reminder.reason,
        state: "DUE",
        evidenceCount: 1,
        uncertainty: "UNKNOWN"
      } satisfies HomeConsideration];
    })
    .sort((left, right) => Date.parse(left.dueAt) - Date.parse(right.dueAt) || left.recordId.localeCompare(right.recordId))
    .slice(0, MAX_HOME_CONSIDERATIONS);
}
