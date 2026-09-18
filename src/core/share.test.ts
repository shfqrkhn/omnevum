import { describe, expect, it } from "vitest";
import type { CanonicalRecord } from "./model";
import { projectForAuthorizedShare, projectForShare } from "./share";
import { createShareGrant, revokeShareGrant } from "./sharing";
import { CommandBus } from "./commands";
import { CanonicalStore } from "./storage";

function record(id: string, sensitivity: "PRIVATE" | "SHARED", data: Record<string, unknown>): CanonicalRecord {
  const now = new Date().toISOString();
  return { id, recordType: "note", owner: "core.capture", schemaVersion: 1, createdAt: now, modifiedAt: now, provenance: { source: "USER_INPUT", capturedAt: now, sourceId: "private-source" }, truthClass: "USER_OBSERVATION", sensitivity, revision: 1, deleted: false, data };
}

describe("bounded share projection", () => {
  it("does not transitively include private records or credentials", () => {
    const publicRecord = record("public", "SHARED", { text: "share", linkedId: "private", accessToken: "never" });
    const privateRecord = record("private", "PRIVATE", { text: "do not share" });
    const projection = projectForShare([publicRecord, privateRecord], ["public", "private"]);
    expect(projection.records).toHaveLength(1);
    expect(projection.records[0]?.data).toEqual({ text: "share" });
    expect(projection.records[0]?.provenance.sourceId).toBeUndefined();
  });

  it("requires explicit inclusion for private snapshots", () => {
    const privateRecord = record("private", "PRIVATE", { text: "intentional" });
    expect(projectForShare([privateRecord], [privateRecord.id]).records).toHaveLength(0);
    expect(projectForShare([privateRecord], [privateRecord.id], true).records[0]?.sensitivity).toBe("SHARED");
  });

  it("requires an active purpose-bound grant for an authorized projection", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-authorized-share`);
    await store.open();
    const commands = new CommandBus(store);
    const source = await commands.create({ recordType: "note", owner: "core.capture", data: { text: "authorized" } });
    const grant = await createShareGrant(commands, { grantedTo: "person:reviewer", purpose: "review", space: "personal", recordIds: [source.id] });
    expect(projectForAuthorizedShare(grant, [source], [source.id], true).records).toHaveLength(1);
    const revoked = await revokeShareGrant(commands, grant.id);
    expect(() => projectForAuthorizedShare(revoked, [source], [source.id], true)).toThrow(/inactive|expired|authorize/);
    store.close();
  });
});
