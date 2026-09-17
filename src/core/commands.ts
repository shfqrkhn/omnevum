import { createOpaqueId } from "./id";
import { MAX_PORTABLE_ARTIFACT_BYTES, sha256Hex, type ArtifactInput } from "./artifact";
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

  public async createArtifact(input: ArtifactInput): Promise<CanonicalRecord> {
    if (!input.fileName.trim()) throw new Error("An artifact file name is required");
    if (input.blob.size > MAX_PORTABLE_ARTIFACT_BYTES) throw new Error("Artifact exceeds the bounded 10 MiB intake limit");
    const now = new Date().toISOString();
    const id = createOpaqueId("artifact");
    const record: CanonicalRecord = {
      id,
      recordType: "artifact",
      owner: "platform.artifact",
      schemaVersion: CURRENT_SCHEMA_VERSION,
      createdAt: now,
      modifiedAt: now,
      provenance: { source: "IMPORT", capturedAt: now, sourceId: input.fileName },
      truthClass: "IMPORTED_RECORD",
      sensitivity: "PRIVATE",
      revision: 1,
      deleted: false,
      data: { text: input.fileName, fileName: input.fileName, mimeType: input.mimeType, size: input.blob.size, sha256: await sha256Hex(input.blob), blobRef: id, space: input.space ?? "personal", triageStatus: "REVIEWED" }
    };
    await this.store.put(record, input.blob);
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

  public async restore(id: string): Promise<CanonicalRecord> {
    const current = await this.store.get(id, true);
    if (!current) throw new Error("Canonical record not found");
    if (!current.deleted) return current;
    const restored = { ...current, deleted: false, modifiedAt: new Date().toISOString(), revision: current.revision + 1 };
    await this.store.put(restored);
    return restored;
  }

  public async relate(sourceId: string, targetId: string, relation = "related"): Promise<CanonicalRecord> {
    if (sourceId === targetId) throw new Error("A record cannot relate to itself");
    const source = await this.store.get(sourceId);
    const target = await this.store.get(targetId);
    if (!source || !target) throw new Error("Both related canonical records must exist");
    const label = relation.trim().slice(0, 120) || "related";
    return this.create({
      recordType: "relationship",
      owner: "platform.relate",
      truthClass: "USER_OBSERVATION",
      sensitivity: source.sensitivity === "SHARED" && target.sensitivity === "SHARED" ? "SHARED" : "PRIVATE",
      data: { text: `${source.id} -> ${target.id}: ${label}`, sourceId, targetId, relation: label, triageStatus: "REVIEWED" }
    });
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
