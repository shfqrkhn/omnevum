import type { VaultDocument } from "./model";
import { parseVault, verifyVaultIntegrity } from "./vault";

export const INCREMENTAL_REPOSITORY_VERSION = 1 as const;
export const DEFAULT_REPOSITORY_CHUNK_BYTES = 256 * 1024;
export const MAX_REPOSITORY_CHUNK_BYTES = 4 * 1024 * 1024;

export interface IncrementalChunkReference {
  digest: string;
  offset: number;
  sizeBytes: number;
}

export interface IncrementalSnapshotManifest {
  format: "OMNEVUM_INCREMENTAL_SNAPSHOT";
  version: typeof INCREMENTAL_REPOSITORY_VERSION;
  logicalVaultId: string;
  snapshotId: string;
  createdAt: string;
  byteLength: number;
  contentDigest: string;
  canonicalRecordIds: string[];
  chunks: IncrementalChunkReference[];
  parentSnapshotId?: string;
}

export interface IncrementalChunkPayload {
  digest: string;
  bytes: Uint8Array;
}

export interface IncrementalSnapshotBundle {
  manifest: IncrementalSnapshotManifest;
  chunks: IncrementalChunkPayload[];
}

export interface IncrementalSnapshotInput {
  logicalVaultId: string;
  snapshotId: string;
  createdAt: string;
  vault: VaultDocument;
  parentSnapshotId?: string;
  chunkBytes?: number;
}

export interface IncrementalUploadStatus {
  sessionId: string;
  snapshotId: string;
  uploadedDigests: string[];
  missingDigests: string[];
  complete: boolean;
}

export interface PruneResult {
  removedSnapshots: number;
  removedChunks: number;
  retainedChunks: number;
}

export interface RestoredIncrementalSnapshot {
  manifest: IncrementalSnapshotManifest;
  vault: VaultDocument;
}

interface UploadSession {
  manifest: IncrementalSnapshotManifest;
  uploadedDigests: Set<string>;
}

export async function createIncrementalSnapshot(input: IncrementalSnapshotInput): Promise<IncrementalSnapshotBundle> {
  assertIdentity(input.logicalVaultId, "logical Vault ID");
  assertIdentity(input.snapshotId, "snapshot ID");
  assertTimestamp(input.createdAt);
  const chunkBytes = input.chunkBytes ?? DEFAULT_REPOSITORY_CHUNK_BYTES;
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 1 || chunkBytes > MAX_REPOSITORY_CHUNK_BYTES) throw new Error("Repository chunk size is outside the supported bound");
  const text = JSON.stringify(input.vault);
  const bytes = new TextEncoder().encode(text);
  const chunks: IncrementalChunkPayload[] = [];
  const references: IncrementalChunkReference[] = [];
  for (let offset = 0; offset < bytes.byteLength; offset += chunkBytes) {
    const chunk = bytes.slice(offset, Math.min(offset + chunkBytes, bytes.byteLength));
    const digest = await digestBytes(chunk);
    references.push({ digest, offset, sizeBytes: chunk.byteLength });
    if (!chunks.some((candidate) => candidate.digest === digest)) chunks.push({ digest, bytes: chunk });
  }
  if (bytes.byteLength === 0) throw new Error("Repository snapshot cannot be empty");
  return {
    manifest: {
      format: "OMNEVUM_INCREMENTAL_SNAPSHOT",
      version: INCREMENTAL_REPOSITORY_VERSION,
      logicalVaultId: input.logicalVaultId,
      snapshotId: input.snapshotId,
      createdAt: input.createdAt,
      byteLength: bytes.byteLength,
      contentDigest: await digestBytes(bytes),
      canonicalRecordIds: input.vault.records.map((record) => record.id).sort(),
      chunks: references,
      ...(input.parentSnapshotId ? { parentSnapshotId: input.parentSnapshotId } : {})
    },
    chunks
  };
}

export class IncrementalRepository {
  private readonly chunks = new Map<string, Uint8Array>();
  private readonly snapshots = new Map<string, IncrementalSnapshotManifest>();
  private readonly uploads = new Map<string, UploadSession>();

  public async beginUpload(bundle: IncrementalSnapshotBundle, sessionId = `${bundle.manifest.logicalVaultId}:${bundle.manifest.snapshotId}`): Promise<IncrementalUploadStatus> {
    assertManifest(bundle.manifest);
    if (bundle.chunks.some((chunk) => !bundle.manifest.chunks.some((reference) => reference.digest === chunk.digest))) throw new Error("Upload contains an undeclared chunk");
    const existing = this.snapshots.get(bundle.manifest.snapshotId);
    if (existing && stableManifest(existing) !== stableManifest(bundle.manifest)) throw new Error("Snapshot ID is already bound to a different manifest");
    const current = this.uploads.get(sessionId);
    if (current && stableManifest(current.manifest) !== stableManifest(bundle.manifest)) throw new Error("Upload session is already bound to a different manifest");
    const session = current ?? { manifest: structuredClone(bundle.manifest), uploadedDigests: new Set<string>() };
    for (const reference of bundle.manifest.chunks) if (this.chunks.has(reference.digest)) session.uploadedDigests.add(reference.digest);
    this.uploads.set(sessionId, session);
    return this.status(sessionId);
  }

  public async putChunk(sessionId: string, payload: IncrementalChunkPayload): Promise<void> {
    const session = this.requireUpload(sessionId);
    const reference = session.manifest.chunks.find((candidate) => candidate.digest === payload.digest);
    if (!reference || payload.bytes.byteLength !== reference.sizeBytes || await digestBytes(payload.bytes) !== reference.digest) throw new Error("Chunk does not match the snapshot manifest");
    this.chunks.set(payload.digest, payload.bytes.slice());
    session.uploadedDigests.add(payload.digest);
  }

  public resumeUpload(sessionId: string): IncrementalUploadStatus {
    return this.status(sessionId);
  }

  public status(sessionId: string): IncrementalUploadStatus {
    const session = this.requireUpload(sessionId);
    const uploadedDigests = session.manifest.chunks.filter((reference) => session.uploadedDigests.has(reference.digest) || this.chunks.has(reference.digest)).map((reference) => reference.digest);
    const missingDigests = session.manifest.chunks.filter((reference) => !uploadedDigests.includes(reference.digest)).map((reference) => reference.digest);
    return { sessionId, snapshotId: session.manifest.snapshotId, uploadedDigests: [...new Set(uploadedDigests)], missingDigests: [...new Set(missingDigests)], complete: missingDigests.length === 0 };
  }

  public commitUpload(sessionId: string): IncrementalSnapshotManifest {
    const session = this.requireUpload(sessionId);
    const status = this.status(sessionId);
    if (!status.complete) throw new Error("Snapshot upload is incomplete; resume before committing");
    const manifest = structuredClone(session.manifest);
    this.snapshots.set(manifest.snapshotId, manifest);
    this.uploads.delete(sessionId);
    return manifest;
  }

  public listSnapshots(): IncrementalSnapshotManifest[] {
    return [...this.snapshots.values()].map((manifest) => structuredClone(manifest)).sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.snapshotId.localeCompare(right.snapshotId));
  }

  public async restore(snapshotId: string): Promise<RestoredIncrementalSnapshot> {
    const manifest = this.snapshots.get(snapshotId);
    if (!manifest) throw new Error("Snapshot is not available");
    const bytes = new Uint8Array(manifest.byteLength);
    for (const reference of manifest.chunks) {
      const chunk = this.chunks.get(reference.digest);
      if (!chunk || chunk.byteLength !== reference.sizeBytes || await digestBytes(chunk) !== reference.digest) throw new Error("Snapshot integrity check failed; no data was restored");
      bytes.set(chunk, reference.offset);
    }
    if (await digestBytes(bytes) !== manifest.contentDigest) throw new Error("Snapshot content digest does not match the manifest; no data was restored");
    const vault = parseVault(new TextDecoder().decode(bytes));
    await verifyVaultIntegrity(vault);
    if (stableJson(vault.records.map((record) => record.id).sort()) !== stableJson(manifest.canonicalRecordIds)) throw new Error("Snapshot canonical record identity does not match the manifest; no data was restored");
    return { manifest: structuredClone(manifest), vault };
  }

  public pruneUnreachable(keepSnapshotIds: readonly string[]): PruneResult {
    const keep = new Set(keepSnapshotIds);
    if ([...keep].some((snapshotId) => !this.snapshots.has(snapshotId))) throw new Error("Cannot prune an unknown snapshot");
    const beforeSnapshots = this.snapshots.size;
    for (const snapshotId of this.snapshots.keys()) if (!keep.has(snapshotId)) this.snapshots.delete(snapshotId);
    const reachable = new Set<string>();
    for (const manifest of this.snapshots.values()) for (const reference of manifest.chunks) reachable.add(reference.digest);
    for (const session of this.uploads.values()) for (const reference of session.manifest.chunks) if (session.uploadedDigests.has(reference.digest)) reachable.add(reference.digest);
    const beforeChunks = this.chunks.size;
    for (const digest of this.chunks.keys()) if (!reachable.has(digest)) this.chunks.delete(digest);
    return { removedSnapshots: beforeSnapshots - this.snapshots.size, removedChunks: beforeChunks - this.chunks.size, retainedChunks: this.chunks.size };
  }

  private requireUpload(sessionId: string): UploadSession {
    const session = this.uploads.get(sessionId);
    if (!session) throw new Error("Upload session is not available");
    return session;
  }
}

function assertManifest(manifest: IncrementalSnapshotManifest): void {
  if (manifest.format !== "OMNEVUM_INCREMENTAL_SNAPSHOT" || manifest.version !== INCREMENTAL_REPOSITORY_VERSION || !manifest.logicalVaultId.trim() || !manifest.snapshotId.trim() || !Number.isSafeInteger(manifest.byteLength) || manifest.byteLength <= 0 || !/^[a-f0-9]{64}$/u.test(manifest.contentDigest) || manifest.chunks.length === 0 || manifest.chunks.some((chunk) => !/^[a-f0-9]{64}$/u.test(chunk.digest) || !Number.isSafeInteger(chunk.offset) || chunk.offset < 0 || !Number.isSafeInteger(chunk.sizeBytes) || chunk.sizeBytes <= 0)) throw new Error("Incremental snapshot manifest is invalid");
  if (manifest.chunks[0]?.offset !== 0 || manifest.chunks.some((chunk, index) => index > 0 && chunk.offset !== manifest.chunks[index - 1]!.offset + manifest.chunks[index - 1]!.sizeBytes)) throw new Error("Incremental snapshot chunks are not contiguous");
  const last = manifest.chunks.at(-1);
  if (!last || last.offset + last.sizeBytes !== manifest.byteLength) throw new Error("Incremental snapshot length is invalid");
}

function assertIdentity(value: string, label: string): void {
  if (!value.trim() || value.length > 200) throw new Error(`${label} is invalid`);
}

function assertTimestamp(value: string): void {
  if (!value.trim() || Number.isNaN(Date.parse(value))) throw new Error("Repository timestamp is invalid");
}

async function digestBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function stableManifest(manifest: IncrementalSnapshotManifest): string {
  return stableJson(manifest);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;
  return JSON.stringify(value);
}
