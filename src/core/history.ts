import type { CommandBus } from "./commands";
import type { CanonicalRecord } from "./model";
import type { CanonicalStore } from "./storage";

export interface RecordChange {
  path: string;
  before: unknown;
  after: unknown;
}

export function diffRecords(before: CanonicalRecord, after: CanonicalRecord): RecordChange[] {
  const changes: RecordChange[] = [];
  compareValue(before, after, "", changes);
  return changes;
}

export async function historyWithDiffs(store: CanonicalStore, recordId: string): Promise<Array<{ revision: number; recordedAt: string; changesFromPrevious: RecordChange[] }>> {
  const entries = await store.history(recordId);
  return entries.map((entry, index) => ({ revision: entry.revision, recordedAt: entry.recordedAt, changesFromPrevious: index === 0 ? [] : diffRecords(entries[index - 1]!.record, entry.record) }));
}

export async function revertToRevision(commands: CommandBus, store: CanonicalStore, recordId: string, targetRevision: number): Promise<CanonicalRecord> {
  const current = await store.get(recordId, true);
  if (!current) throw new Error("Canonical record not found");
  const target = (await store.history(recordId)).find((entry) => entry.revision === targetRevision)?.record;
  if (!target) throw new Error("Target revision was not found");
  const data = target.deleted ? { ...target.data, restoreIntent: "EXPLICIT_USER_RESTORE", restoredFromRevision: targetRevision } : { ...target.data };
  return commands.update(recordId, data, current.revision);
}

function compareValue(before: unknown, after: unknown, path: string, changes: RecordChange[]): void {
  if (Object.is(before, after)) return;
  if (typeof before === "object" && before !== null && typeof after === "object" && after !== null && !Array.isArray(before) && !Array.isArray(after)) {
    const keys = new Set([...Object.keys(before as Record<string, unknown>), ...Object.keys(after as Record<string, unknown>)]);
    for (const key of [...keys].sort()) compareValue((before as Record<string, unknown>)[key], (after as Record<string, unknown>)[key], path ? `${path}.${key}` : key, changes);
    return;
  }
  changes.push({ path, before, after });
}
