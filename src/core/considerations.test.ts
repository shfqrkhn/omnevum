import type { CanonicalRecord } from "./model";
import { makeReminderData } from "./time";
import { MAX_HOME_CONSIDERATIONS, projectDueReminderConsiderations } from "./considerations";

function reminder(id: string, dueAt: string): CanonicalRecord {
  const now = new Date().toISOString();
  return { id, recordType: "observation", owner: "platform.time", schemaVersion: 1, createdAt: now, modifiedAt: now, provenance: { source: "USER_INPUT", capturedAt: now }, truthClass: "USER_OBSERVATION", sensitivity: "PRIVATE", revision: 1, deleted: false, data: { ...makeReminderData(`Reminder ${id}`, dueAt), text: `Reminder ${id}` } };
}

describe("Home consideration projection", () => {
  it("projects bounded, source-addressable due reminders with explicit uncertainty", () => {
    const now = new Date("2026-09-19T12:00:00.000Z");
    const records = Array.from({ length: MAX_HOME_CONSIDERATIONS + 2 }, (_, index) => reminder(`reminder-${index}`, `2026-09-19T${String(index).padStart(2, "0")}:00:00.000Z`));
    const projected = projectDueReminderConsiderations(records, now);
    expect(projected).toHaveLength(MAX_HOME_CONSIDERATIONS);
    expect(projected[0]).toMatchObject({ recordId: "reminder-0", evidenceCount: 1, uncertainty: "UNKNOWN", reason: "DUE_ON_RESUME", state: "DUE" });
  });

  it("does not surface upcoming or completed reminders", () => {
    const now = new Date("2026-09-19T12:00:00.000Z");
    const upcoming = reminder("upcoming", "2026-09-20T12:00:00.000Z");
    const completed = reminder("completed", "2026-09-18T12:00:00.000Z");
    completed.data.status = "DONE";
    expect(projectDueReminderConsiderations([upcoming, completed], now)).toEqual([]);
  });
});
