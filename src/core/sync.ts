import type { CanonicalRecord } from "./model";
import type { CanonicalStore } from "./storage";

export interface SyncConflict {
  recordId: string;
  local: CanonicalRecord;
  remote: CanonicalRecord;
  reason: "EQUAL_REVISION_DIFFERENCE" | "TOMBSTONE_RESURRECTION";
}

export interface ReplicaMergeResult {
  records: CanonicalRecord[];
  conflicts: SyncConflict[];
  tombstonesPreserved: number;
}

export interface SyncTransport {
  pull(): Promise<CanonicalRecord[]>;
  push(records: CanonicalRecord[]): Promise<void>;
}

export interface SyncRunResult extends ReplicaMergeResult {
  imported: number;
  skipped: number;
  importConflicts: number;
}

export type SyncFailurePhase = "PULL" | "LOCAL_IMPORT" | "PUSH";

export class SyncFailure extends Error {
  public readonly cause: unknown;

  public constructor(public readonly phase: SyncFailurePhase, cause: unknown, public readonly partialResult?: SyncRunResult) {
    super(cause instanceof Error && cause.message ? cause.message : "Sync failed");
    this.name = "SyncFailure";
    this.cause = cause;
  }
}

export class SyncEngine {
  public constructor(private readonly store: CanonicalStore, private readonly transport: SyncTransport) {}

  public async synchronize(): Promise<SyncRunResult> {
    const local = await this.store.list(true);
    let remote: CanonicalRecord[];
    try {
      remote = await this.transport.pull();
    } catch (error) {
      throw new SyncFailure("PULL", error);
    }
    const merged = mergeReplicaRecords(local, remote);
    let imported: Awaited<ReturnType<CanonicalStore["importVault"]>>;
    try {
      imported = await this.store.importVault({ format: "OMNEVUM_VAULT", version: 1, exportedAt: new Date().toISOString(), records: merged.records });
    } catch (error) {
      throw new SyncFailure("LOCAL_IMPORT", error);
    }
    const result: SyncRunResult = { ...merged, imported: imported.imported, skipped: imported.skipped, importConflicts: imported.conflicts };
    try {
      await this.transport.push(merged.records);
    } catch (error) {
      throw new SyncFailure("PUSH", error, result);
    }
    return result;
  }
}

export function mergeReplicaRecords(local: CanonicalRecord[], remote: CanonicalRecord[]): ReplicaMergeResult {
  const merged = new Map(local.map((record) => [record.id, record]));
  const conflicts: SyncConflict[] = [];
  let tombstonesPreserved = 0;

  for (const incoming of remote) {
    const current = merged.get(incoming.id);
    if (!current) {
      merged.set(incoming.id, incoming);
      continue;
    }
    if (current.deleted && !incoming.deleted && incoming.data.restoreIntent !== "EXPLICIT_USER_RESTORE") {
      tombstonesPreserved += 1;
      conflicts.push({ recordId: incoming.id, local: current, remote: incoming, reason: "TOMBSTONE_RESURRECTION" });
      continue;
    }
    if (current.revision === incoming.revision) {
      if (stableJson(current) !== stableJson(incoming)) conflicts.push({ recordId: incoming.id, local: current, remote: incoming, reason: "EQUAL_REVISION_DIFFERENCE" });
      continue;
    }
    if (incoming.revision > current.revision) merged.set(incoming.id, incoming);
  }

  return { records: [...merged.values()].sort((left, right) => left.id.localeCompare(right.id)), conflicts, tombstonesPreserved };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;
  return JSON.stringify(value);
}
