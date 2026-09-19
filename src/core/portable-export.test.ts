import { describe, expect, it } from "vitest";
import { makeArtifactOriginalsExport, makeHumanReadableExport, parseArtifactOriginalsExport, serializePortableJson, verifyHumanReadableExport } from "./portable-export";
import type { VaultDocument } from "./model";

const vault: VaultDocument = {
  format: "OMNEVUM_VAULT",
  version: 1,
  exportedAt: "2026-09-19T00:00:00.000Z",
  records: [{ id: "note-1", recordType: "note", owner: "core.capture", schemaVersion: 1, createdAt: "2026-09-19T00:00:00.000Z", modifiedAt: "2026-09-19T00:00:00.000Z", provenance: { source: "USER_INPUT", capturedAt: "2026-09-19T00:00:00.000Z" }, truthClass: "USER_OBSERVATION", sensitivity: "PRIVATE", revision: 1, deleted: false, data: { text: "A `portable` note" } }],
  history: [],
  artifacts: [{ id: "artifact-1", mimeType: "text/plain", dataBase64: "aGVsbG8=" }]
};

describe("portable recovery exports", () => {
  it("reports deterministic UTF-8 sizes for JSON", () => {
    const result = serializePortableJson({ text: "hello" });
    expect(result.sizeBytes).toBe(new TextEncoder().encode(result.text).byteLength);
  });

  it("creates and validates a human-readable projection", () => {
    const result = makeHumanReadableExport(vault);
    expect(result.text).toContain("Record count: 1");
    expect(result.text).toContain("A 'portable' note");
    expect(() => verifyHumanReadableExport(result.text, 1)).not.toThrow();
    expect(() => verifyHumanReadableExport(result.text, 2)).toThrow("record count");
  });

  it("round-trips original artifact payloads in a bounded readable bundle", () => {
    const original = vault.records[0];
    if (!original) throw new Error("fixture record missing");
    const result = makeArtifactOriginalsExport({ ...vault, records: [{ ...original, id: "artifact-1", recordType: "artifact", data: { fileName: "hello.txt" } }] });
    const parsed = parseArtifactOriginalsExport(result.text);
    expect(parsed).toMatchObject({ recordCount: 1, artifactCount: 1, artifacts: [{ recordId: "artifact-1", fileName: "hello.txt", sizeBytes: 5, dataBase64: "aGVsbG8=" }] });
  });
});
