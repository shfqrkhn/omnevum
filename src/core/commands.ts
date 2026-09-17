import { createOpaqueId } from "./id";
import type { CanonicalRecord, RecordType } from "./model";
import { CURRENT_SCHEMA_VERSION } from "./model";
import { CanonicalStore } from "./storage";

export interface CreateRecordInput {
  recordType: RecordType;
  owner: string;
  data: Record<string, unknown>;
  truthClass?: CanonicalRecord["truthClass"];
  sensitivity?: CanonicalRecord["sensitivity"];
}

export class RevisionConflictError extends Error {
  public constructor(message = "Canonical record changed; reload before retrying") {
    super(message);
    this.name = "RevisionConflictError";
  }
}

export class CommandBus {
  public constructor(private readonly store: CanonicalStore) {}

  public async create(input: CreateRecordInput): Promise<CanonicalRecord> {
    if (!input.owner.trim()) throw new Error("A canonical owner is required");
    const now = new Date().toISOString();
    const record: CanonicalRecord = {
      id: createOpaqueId(),
      recordType: input.recordType,
      owner: input.owner,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      createdAt: now,
      modifiedAt: now,
      provenance: { source: "USER_INPUT", capturedAt: now },
      truthClass: input.truthClass ?? "USER_OBSERVATION",
      sensitivity: input.sensitivity ?? "PRIVATE",
      revision: 1,
      deleted: false,
      data: input.data
    };
    await this.store.put(record);
    return record;
  }

  public async update(id: string, data: Record<string, unknown>, expectedRevision?: number): Promise<CanonicalRecord> {
    const current = await this.store.get(id, true);
    if (!current) throw new Error("Canonical record not found");
    if (expectedRevision !== undefined && current.revision !== expectedRevision) throw new RevisionConflictError();
    const updated: CanonicalRecord = {
      ...current,
      data,
      modifiedAt: new Date().toISOString(),
      revision: current.revision + 1,
      deleted: false
    };
    await this.store.put(updated);
    return updated;
  }

  public async archive(id: string): Promise<void> {
    const current = await this.store.get(id, true);
    if (!current) return;
    await this.store.put({ ...current, deleted: true, modifiedAt: new Date().toISOString(), revision: current.revision + 1 });
  }

  public async undo(id: string): Promise<CanonicalRecord> {
    const current = await this.store.get(id, true);
    if (!current) throw new Error("Canonical record not found");
    const previous = (await this.store.history(id)).filter((entry) => entry.revision < current.revision).at(-1)?.record;
    if (!previous) throw new Error("No previous canonical revision");
    const restored: CanonicalRecord = {
      ...previous,
      modifiedAt: new Date().toISOString(),
      revision: current.revision + 1,
      deleted: false
    };
    await this.store.put(restored);
    return restored;
  }
}
