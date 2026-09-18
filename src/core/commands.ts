import { createOpaqueId } from "./id";
import { MAX_PORTABLE_ARTIFACT_BYTES, sha256Hex, type ArtifactInput } from "./artifact";
import type { CanonicalRecord, RecordType } from "./model";
import { CURRENT_SCHEMA_VERSION } from "./model";
import { CanonicalStore } from "./storage";

export interface CreateRecordInput {
  recordType: RecordType;
  owner: string;
  data: Record<string, unknown>;
  subjectId?: string;
  truthClass?: CanonicalRecord["truthClass"];
  sensitivity?: CanonicalRecord["sensitivity"];
  provenance?: Partial<CanonicalRecord["provenance"]>;
}

export interface DerivedArtifactInput {
  sourceId: string;
  operation: string;
  fileName: string;
  mimeType: string;
  blob: Blob;
  space?: string;
}

export type TriageRouteTarget = "note" | "task";

export class RevisionConflictError extends Error {
  public constructor(message = "Canonical record changed; reload before retrying") {
    super(message);
    this.name = "RevisionConflictError";
  }
}

export class CommandBus {
  public constructor(private readonly store: CanonicalStore) {}

  public async get(id: string, includeDeleted = false): Promise<CanonicalRecord | undefined> {
    return this.store.get(id, includeDeleted);
  }

  public async findBySourceId(sourceId: string): Promise<CanonicalRecord[]> {
    return this.store.findByProvenance(sourceId);
  }

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
      ...(input.subjectId?.trim() ? { subjectId: input.subjectId.trim().slice(0, 160) } : {}),
      provenance: { source: input.provenance?.source ?? "USER_INPUT", capturedAt: input.provenance?.capturedAt ?? now, ...(input.provenance?.sourceId ? { sourceId: input.provenance.sourceId } : {}) },
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

  public async createDerivedArtifact(input: DerivedArtifactInput): Promise<CanonicalRecord> {
    const source = await this.store.get(input.sourceId, true);
    if (!source) throw new Error("Source Artifact was not found");
    if (!input.operation.trim() || !input.fileName.trim()) throw new Error("Derived Artifact operation and file name are required");
    if (input.blob.size > MAX_PORTABLE_ARTIFACT_BYTES) throw new Error("Derived Artifact exceeds the bounded 10 MiB intake limit");
    const now = new Date().toISOString();
    const id = createOpaqueId("artifact-derived");
    const record: CanonicalRecord = {
      id,
      recordType: "artifact",
      owner: "platform.artifact",
      schemaVersion: CURRENT_SCHEMA_VERSION,
      createdAt: now,
      modifiedAt: now,
      provenance: { source: "IMPORT", capturedAt: now, sourceId: source.id },
      truthClass: "DERIVED",
      sensitivity: source.sensitivity,
      revision: 1,
      deleted: false,
      data: { text: input.fileName, fileName: input.fileName, mimeType: input.mimeType || "application/octet-stream", size: input.blob.size, sha256: await sha256Hex(input.blob), blobRef: id, derivedFrom: { recordId: source.id, revision: source.revision }, operation: input.operation.trim().slice(0, 240), space: input.space ?? source.data.space ?? "personal", triageStatus: "REVIEWED" }
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
    await this.store.put(updated, undefined, current.revision);
    return updated;
  }

  public async archive(id: string): Promise<void> {
    const current = await this.store.get(id, true);
    if (!current) return;
    await this.store.put({ ...current, deleted: true, modifiedAt: new Date().toISOString(), revision: current.revision + 1 }, undefined, current.revision);
  }

  public async restore(id: string): Promise<CanonicalRecord> {
    const current = await this.store.get(id, true);
    if (!current) throw new Error("Canonical record not found");
    if (!current.deleted) return current;
    const restored = { ...current, deleted: false, modifiedAt: new Date().toISOString(), revision: current.revision + 1, data: { ...current.data, restoreIntent: "EXPLICIT_USER_RESTORE", restoredFromRevision: current.revision } };
    await this.store.put(restored, undefined, current.revision);
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

  public async linkTriage(sourceId: string, targetId: string, relation = "related", expectedRevision?: number): Promise<CanonicalRecord> {
    if (sourceId === targetId) throw new Error("A record cannot link to itself");
    const source = await this.store.get(sourceId, true);
    const target = await this.store.get(targetId);
    if (!source || source.deleted || !target) throw new Error("Both triage records must be active canonical records");
    if (expectedRevision !== undefined && source.revision !== expectedRevision) throw new RevisionConflictError();
    const label = relation.trim().slice(0, 120) || "related";
    const existing = (await this.store.list()).find((record) => record.recordType === "relationship" && record.data.sourceId === sourceId && record.data.targetId === targetId && record.data.relation === label);
    const relationship = existing ?? await this.relate(sourceId, targetId, label);
    await this.update(sourceId, { ...source.data, triageStatus: "REVIEWED", triageDisposition: "LINKED", triageLinkId: relationship.id }, expectedRevision ?? source.revision);
    return relationship;
  }

  public async routeTriage(sourceId: string, target: TriageRouteTarget, expectedRevision?: number): Promise<CanonicalRecord> {
    const source = await this.store.get(sourceId, true);
    if (!source || source.deleted) throw new Error("The triage source must be an active canonical record");
    if (expectedRevision !== undefined && source.revision !== expectedRevision) throw new RevisionConflictError();
    const routed = await this.create({
      recordType: target,
      owner: "core.capture",
      truthClass: source.truthClass,
      sensitivity: source.sensitivity,
      provenance: { source: "USER_INPUT", sourceId: source.id },
      ...(source.subjectId ? { subjectId: source.subjectId } : {}),
      data: { ...source.data, ...(target === "task" && source.data.status !== "DONE" ? { status: "OPEN" } : {}), triageStatus: "REVIEWED", triageDisposition: "ROUTED", triageSourceId: source.id }
    });
    const routedSource = { ...source.data, triageStatus: "REVIEWED", triageDisposition: "ROUTED", triageRoutedTo: routed.id };
    const updated = await this.update(source.id, routedSource, expectedRevision ?? source.revision);
    await this.archive(updated.id);
    return routed;
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
    await this.store.put(restored, undefined, current.revision);
    return restored;
  }
}
