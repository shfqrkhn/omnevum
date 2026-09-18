import { createOpaqueId } from "./id";
import { MAX_PORTABLE_ARTIFACT_BYTES, sha256Hex, type ArtifactInput, type ArtifactAdapter, type DerivedArtifactText } from "./artifact";
import type { CanonicalRecord, RecordType } from "./model";
import { CURRENT_SCHEMA_VERSION } from "./model";
import { CanonicalStore } from "./storage";
import { scrubSensitiveValue } from "./safety";

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
  adapter?: ArtifactAdapter;
  metadata?: Record<string, unknown>;
  derivedText?: DerivedArtifactText;
}

export type TriageRouteTarget = "note" | "task";

export interface TriageSplitPart {
  target: TriageRouteTarget;
  text: string;
}

export class RevisionConflictError extends Error {
  public constructor(message = "Canonical record changed; reload before retrying") {
    super(message);
    this.name = "RevisionConflictError";
  }
}

export class CommandBus {
  public constructor(private readonly store: CanonicalStore) {}

  private makeRecord(input: CreateRecordInput): CanonicalRecord {
    if (!input.owner.trim()) throw new Error("A canonical owner is required");
    const now = new Date().toISOString();
    return {
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
  }

  private nextRevision(current: CanonicalRecord, data: Record<string, unknown>, deleted = current.deleted): CanonicalRecord {
    return { ...current, data, modifiedAt: new Date().toISOString(), revision: current.revision + 1, deleted };
  }

  public async get(id: string, includeDeleted = false): Promise<CanonicalRecord | undefined> {
    return this.store.get(id, includeDeleted);
  }

  public async list(includeDeleted = false): Promise<CanonicalRecord[]> {
    return this.store.list(includeDeleted);
  }

  public async findBySourceId(sourceId: string): Promise<CanonicalRecord[]> {
    return this.store.findByProvenance(sourceId);
  }

  public async create(input: CreateRecordInput): Promise<CanonicalRecord> {
    const record = this.makeRecord(input);
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
      provenance: { source: "IMPORT", capturedAt: now, sourceId: input.sourceId?.trim() || input.fileName },
      truthClass: "IMPORTED_RECORD",
      sensitivity: "PRIVATE",
      revision: 1,
      deleted: false,
      data: {
        text: input.fileName,
        fileName: input.fileName,
        mimeType: input.mimeType,
        size: input.blob.size,
        sha256: await sha256Hex(input.blob),
        blobRef: id,
        space: input.space ?? "personal",
        triageStatus: "REVIEWED",
        ...(input.adapter ? { adapter: input.adapter } : {}),
        ...(input.metadata ? { adapterMetadata: scrubSensitiveValue(input.metadata) } : {}),
        ...(input.derivedText ? { derivedText: input.derivedText } : {})
      }
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
      data: {
        text: input.fileName,
        fileName: input.fileName,
        mimeType: input.mimeType || "application/octet-stream",
        size: input.blob.size,
        sha256: await sha256Hex(input.blob),
        blobRef: id,
        derivedFrom: { recordId: source.id, revision: source.revision },
        operation: input.operation.trim().slice(0, 240),
        space: input.space ?? source.data.space ?? "personal",
        triageStatus: "REVIEWED",
        ...(input.adapter ? { adapter: input.adapter } : {}),
        ...(input.metadata ? { adapterMetadata: scrubSensitiveValue(input.metadata) } : {}),
        ...(input.derivedText ? { derivedText: input.derivedText } : {})
      }
    };
    await this.store.put(record, input.blob);
    return record;
  }

  public async update(id: string, data: Record<string, unknown>, expectedRevision?: number): Promise<CanonicalRecord> {
    const current = await this.store.get(id, true);
    if (!current) throw new Error("Canonical record not found");
    if (expectedRevision !== undefined && current.revision !== expectedRevision) throw new RevisionConflictError();
    const updated = this.nextRevision(current, data, false);
    await this.store.put(updated, undefined, current.revision);
    return updated;
  }

  public async archive(id: string): Promise<void> {
    const current = await this.store.get(id, true);
    if (!current) return;
    await this.store.put(this.nextRevision(current, current.data, true), undefined, current.revision);
  }

  public async restore(id: string): Promise<CanonicalRecord> {
    const current = await this.store.get(id, true);
    if (!current) throw new Error("Canonical record not found");
    if (!current.deleted) return current;
    const restored = this.nextRevision(current, { ...current.data, restoreIntent: "EXPLICIT_USER_RESTORE", restoredFromRevision: current.revision }, false);
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
    const relationship = existing ?? this.makeRecord({
      recordType: "relationship",
      owner: "platform.relate",
      truthClass: "USER_OBSERVATION",
      sensitivity: source.sensitivity === "SHARED" && target.sensitivity === "SHARED" ? "SHARED" : "PRIVATE",
      data: { text: `${source.id} -> ${target.id}: ${label}`, sourceId, targetId, relation: label, triageStatus: "REVIEWED" }
    });
    const linked = this.nextRevision(source, { ...source.data, triageStatus: "REVIEWED", triageDisposition: "LINKED", triageLinkId: relationship.id }, false);
    await this.store.putMany([
      ...(existing ? [] : [{ record: relationship }]),
      { record: linked, expectedPreviousRevision: expectedRevision ?? source.revision }
    ]);
    return relationship;
  }

  public async routeTriage(sourceId: string, target: TriageRouteTarget, expectedRevision?: number): Promise<CanonicalRecord> {
    const source = await this.store.get(sourceId, true);
    if (!source || source.deleted) throw new Error("The triage source must be an active canonical record");
    if (expectedRevision !== undefined && source.revision !== expectedRevision) throw new RevisionConflictError();
    const routed = this.makeRecord({
      recordType: target,
      owner: "core.capture",
      truthClass: source.truthClass,
      sensitivity: source.sensitivity,
      provenance: { source: "USER_INPUT", sourceId: source.id },
      ...(source.subjectId ? { subjectId: source.subjectId } : {}),
      data: { ...source.data, ...(target === "task" && source.data.status !== "DONE" ? { status: "OPEN" } : {}), triageStatus: "REVIEWED", triageDisposition: "ROUTED", triageSourceId: source.id }
    });
    const routedSource = { ...source.data, triageStatus: "REVIEWED", triageDisposition: "ROUTED", triageRoutedTo: routed.id };
    const updated = this.nextRevision(source, routedSource, false);
    const archived = this.nextRevision(updated, updated.data, true);
    await this.store.putMany([
      { record: routed },
      { record: updated, expectedPreviousRevision: expectedRevision ?? source.revision },
      { record: archived, expectedPreviousRevision: updated.revision }
    ]);
    return routed;
  }

  public async splitTriage(sourceId: string, parts: TriageSplitPart[], expectedRevision?: number): Promise<CanonicalRecord[]> {
    const normalized = parts.map((part) => ({ target: part.target, text: part.text.trim().slice(0, 2000) }));
    if (normalized.length < 2 || normalized.length > 4) throw new Error("Triage split requires two to four parts");
    if (normalized.some((part) => (part.target !== "note" && part.target !== "task") || !part.text)) throw new Error("Each triage split part needs a note or task type and text");

    const source = await this.store.get(sourceId, true);
    if (!source) throw new Error("The triage source must be an active canonical record");
    const existing = (await this.store.findByProvenance(sourceId)).filter((record) => record.data.triageDisposition === "SPLIT" && record.data.triageSplitSourceId === sourceId);
    const existingByIndex = new Map(existing.flatMap((record) => typeof record.data.triageSplitIndex === "number" ? [[record.data.triageSplitIndex, record] as const] : []));
    const matches = normalized.map((part, index) => {
      const candidate = existingByIndex.get(index);
      if (!candidate) return undefined;
      if (candidate.recordType !== part.target || candidate.data.text !== part.text || candidate.data.triageSplitCount !== normalized.length) throw new Error("A previous triage split has different parts; no new state was written");
      return candidate;
    });
    if (source.deleted) {
      if (matches.every((record): record is CanonicalRecord => record !== undefined) && existing.length === normalized.length) return matches;
      throw new Error("The triage source is already closed");
    }
    if (expectedRevision !== undefined && source.revision !== expectedRevision) throw new RevisionConflictError();

    const { triageStatus: _status, triageDisposition: _disposition, triageLinkId: _link, triageRoutedTo: _routed, triageSplitSourceId: _splitSource, triageSplitIndex: _splitIndex, triageSplitCount: _splitCount, triageSplitChildren: _children, status: _sourceStatus, ...sourceData } = source.data;
    const children: CanonicalRecord[] = [];
    for (const [index, part] of normalized.entries()) {
      const existingChild = matches[index];
      if (existingChild) {
        children.push(existingChild);
        continue;
      }
      children.push(this.makeRecord({
        recordType: part.target,
        owner: "core.capture",
        truthClass: source.truthClass,
        sensitivity: source.sensitivity,
        provenance: { source: "USER_INPUT", sourceId: source.id },
        ...(source.subjectId ? { subjectId: source.subjectId } : {}),
        data: { ...sourceData, text: part.text, ...(part.target === "task" ? { status: source.data.status === "DONE" ? "DONE" : "OPEN" } : {}), triageStatus: "REVIEWED", triageDisposition: "SPLIT", triageSourceId: source.id, triageSplitSourceId: source.id, triageSplitIndex: index, triageSplitCount: normalized.length }
      }));
    }
    const updated = this.nextRevision(source, { ...source.data, triageStatus: "REVIEWED", triageDisposition: "SPLIT", triageSplitChildren: children.map((child) => child.id) }, false);
    const archived = this.nextRevision(updated, updated.data, true);
    await this.store.putMany([
      ...children.filter((child) => !existingByIndex.has(child.data.triageSplitIndex as number)).map((child) => ({ record: child })),
      { record: updated, expectedPreviousRevision: expectedRevision ?? source.revision },
      { record: archived, expectedPreviousRevision: updated.revision }
    ]);
    return children;
  }

  public async deferTriage(sourceId: string, deferredUntil: string, expectedRevision?: number): Promise<CanonicalRecord> {
    const parsed = Date.parse(deferredUntil);
    if (!Number.isFinite(parsed)) throw new Error("Triage defer time is invalid");
    const source = await this.store.get(sourceId, true);
    if (!source || source.deleted) throw new Error("The triage source must be an active canonical record");
    if (expectedRevision !== undefined && source.revision !== expectedRevision) throw new RevisionConflictError();
    const { triageDisposition: _disposition, triageDeferredUntil: _previousUntil, ...sourceData } = source.data;
    return this.update(sourceId, { ...sourceData, triageStatus: "DEFERRED", triageDeferredUntil: new Date(parsed).toISOString() }, expectedRevision ?? source.revision);
  }

  public async deleteTriage(sourceId: string, expectedRevision?: number): Promise<void> {
    const source = await this.store.get(sourceId, true);
    if (!source || source.deleted) throw new Error("The triage source must be an active canonical record");
    if (expectedRevision !== undefined && source.revision !== expectedRevision) throw new RevisionConflictError();
    const updated = this.nextRevision(source, { ...source.data, triageStatus: "REVIEWED", triageDisposition: "DELETED" }, false);
    const archived = this.nextRevision(updated, updated.data, true);
    await this.store.putMany([
      { record: updated, expectedPreviousRevision: expectedRevision ?? source.revision },
      { record: archived, expectedPreviousRevision: updated.revision }
    ]);
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
