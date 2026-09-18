import { describe, expect, it } from "vitest";
import type { CanonicalRecord } from "./model";
import { makeReminderData, reconcileReminders, reminderState } from "./time";

function reminder(id: string, dueAt: string, status: "OPEN" | "DONE" = "OPEN"): CanonicalRecord {
  const now = new Date().toISOString();
  return { id, recordType: "task", owner: "platform.time", schemaVersion: 1, createdAt: now, modifiedAt: now, provenance: { source: "USER_INPUT", capturedAt: now }, truthClass: "USER_OBSERVATION", sensitivity: "PRIVATE", revision: 1, deleted: false, data: { ...makeReminderData("Check-in", dueAt), status } };
}

describe("Time reminder semantics", () => {
  it("reconciles due state without claiming unavailable background delivery", () => {
    const record = reminder("reminder-1", "2020-01-01T00:00:00.000Z");
    expect(reminderState(record, new Date("2020-01-02T00:00:00.000Z"))).toBe("DUE");
    expect(reconcileReminders([record], new Date("2020-01-02T00:00:00.000Z"))[0]).toMatchObject({ state: "DUE", reason: "DUE_ON_RESUME", deliveryClass: "IN_APP" });
  });

  it("keeps completion distinct from delivery", () => {
    const record = reminder("reminder-2", "2020-01-01T00:00:00.000Z", "DONE");
    expect(reminderState(record, new Date("2020-01-02T00:00:00.000Z"))).toBe("COMPLETED");
  });
});
