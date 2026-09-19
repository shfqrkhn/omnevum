import { describe, expect, it } from "vitest";
import type { VaultDocument } from "./model";
import { createIncrementalSnapshot, IncrementalRepository } from "./incremental-repository";
import { withVaultIntegrity } from "./vault";

const baseVault: VaultDocument = {
  format: "OMNEVUM_VAULT",
  version: 1,
  exportedAt: "2026-09-19T19:00:00.000Z",
  records: [
    { id: "record-a", recordType: "note", owner: "core.capture", schemaVersion: 1, createdAt: "2026-09-19T19:00:00.000Z", modifiedAt: "2026-09-19T19:00:00.000Z", provenance: { source: "USER_INPUT", capturedAt: "2026-09-19T19:00:00.000Z" }, truthClass: "USER_OBSERVATION", sensitivity: "PRIVATE", revision: 1, deleted: false, data: { text: "A large enough record payload for bounded chunking." } },
    { id: "record-b", recordType: "task", owner: "core.capture", schemaVersion: 1, createdAt: "2026-09-19T19:00:00.000Z", modifiedAt: "2026-09-19T19:00:00.000Z", provenance: { source: "USER_INPUT", capturedAt: "2026-09-19T19:00:00.000Z" }, truthClass: "USER_OBSERVATION", sensitivity: "PRIVATE", revision: 1, deleted: false, data: { text: "The second canonical record remains identifiable after restore." } }
  ],
  history: [],
  artifacts: []
};

async function bundle(vault: VaultDocument, snapshotId: string) {
  return createIncrementalSnapshot({ logicalVaultId: "vault-main", snapshotId, createdAt: `2026-09-19T19:00:0${snapshotId === "snapshot-1" ? "1" : "2"}.000Z`, vault, chunkBytes: 64 });
}

describe("bounded incremental Vault repository", () => {
  it("resumes an interrupted upload and restores canonical IDs with integrity", async () => {
    const first = await bundle(await withVaultIntegrity(baseVault), "snapshot-1");
    const repository = new IncrementalRepository();
    const sessionId = "upload-1";
    const initial = await repository.beginUpload(first, sessionId);
    expect(initial.complete).toBe(false);
    const half = Math.ceil(first.chunks.length / 2);
    for (const chunk of first.chunks.slice(0, half)) await repository.putChunk(sessionId, chunk);
    expect(repository.resumeUpload(sessionId).missingDigests.length).toBeGreaterThan(0);
    for (const chunk of first.chunks.slice(half)) await repository.putChunk(sessionId, chunk);
    expect(repository.status(sessionId).complete).toBe(true);
    repository.commitUpload(sessionId);
    const restored = await repository.restore("snapshot-1");
    expect(restored.vault.records.map((record) => record.id)).toEqual(["record-a", "record-b"]);
  });

  it("reuses identical chunks and prunes only unreachable snapshots/chunks", async () => {
    const first = await bundle(await withVaultIntegrity(baseVault), "snapshot-1");
    const secondVault = await withVaultIntegrity({ ...baseVault, records: baseVault.records.map((record) => record.id === "record-b" ? { ...record, revision: 2, modifiedAt: "2026-09-19T19:01:00.000Z", data: { ...record.data, text: "Changed tail" } } : record) });
    const second = await bundle(secondVault, "snapshot-2");
    expect(second.manifest.chunks.some((chunk) => first.manifest.chunks.some((candidate) => candidate.digest === chunk.digest))).toBe(true);
    const repository = new IncrementalRepository();
    for (const [snapshot, sessionId] of [[first, "first"], [second, "second"]] as const) {
      await repository.beginUpload(snapshot, sessionId);
      for (const chunk of snapshot.chunks) await repository.putChunk(sessionId, chunk);
      repository.commitUpload(sessionId);
    }
    const pruned = repository.pruneUnreachable(["snapshot-2"]);
    expect(pruned.removedSnapshots).toBe(1);
    expect(await repository.restore("snapshot-2")).toMatchObject({ manifest: { snapshotId: "snapshot-2" } });
    expect(() => repository.pruneUnreachable(["missing"])).toThrow("unknown snapshot");
  });

  it("rejects a tampered or incomplete chunk before commit", async () => {
    const snapshot = await bundle(await withVaultIntegrity(baseVault), "snapshot-1");
    const repository = new IncrementalRepository();
    await repository.beginUpload(snapshot, "tamper");
    const chunk = snapshot.chunks[0];
    if (!chunk) throw new Error("fixture chunk missing");
    await expect(repository.putChunk("tamper", { digest: chunk.digest, bytes: new TextEncoder().encode("tampered") })).rejects.toThrow("does not match");
    expect(() => repository.commitUpload("tamper")).toThrow("incomplete");
  });
});
