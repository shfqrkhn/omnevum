import { describe, expect, it } from "vitest";
import { CanonicalStore } from "./storage";
import { enumerateRetirementCopies, type RetirementCopyObservation } from "./retirement";
import type { CanonicalRecord } from "./model";

function copy(overrides: Partial<RetirementCopyObservation> = {}): RetirementCopyObservation {
  return {
    id: "local-origin",
    kind: "LOCAL_ORIGIN",
    label: "Local origin",
    configured: true,
    disposition: "DELETABLE",
    state: "PRESENT",
    ...overrides
  };
}

function record(id: string): CanonicalRecord {
  const now = new Date().toISOString();
  return { id, recordType: "note", owner: "core.capture", schemaVersion: 1, createdAt: now, modifiedAt: now, provenance: { source: "USER_INPUT", capturedAt: now }, truthClass: "USER_OBSERVATION", sensitivity: "PRIVATE", revision: 1, deleted: false, data: { text: "retirement copy proof" } };
}

describe("retirement copy inventory", () => {
  it("enumerates configured copies without hiding an unreachable UNKNOWN endpoint", () => {
    const inventory = enumerateRetirementCopies([
      copy(),
      copy({ id: "sync-replica", kind: "SYNC_REPLICA", label: "Sync replica", disposition: "REQUEST_ONLY" }),
      copy({ id: "off-origin-backup", kind: "OFF_ORIGIN_BACKUP", label: "Off-origin backup", disposition: "REQUEST_ONLY", state: "VERIFIED_DELETED" }),
      copy({ id: "remote-artifact-tier", kind: "REMOTE_ARTIFACT_TIER", label: "Remote artifact tier", disposition: "UNREACHABLE", state: "UNKNOWN" })
    ]);
    expect(inventory.copies.map(({ id }) => id)).toEqual(["local-origin", "sync-replica", "off-origin-backup", "remote-artifact-tier"]);
    expect(inventory.copies.find(({ id }) => id === "remote-artifact-tier")).toMatchObject({ disposition: "UNREACHABLE", state: "UNKNOWN" });
    expect(inventory.unresolvedCopyIds).toEqual(["local-origin", "sync-replica", "remote-artifact-tier"]);
    expect(inventory.status).toBe("BLOCKED");
  });

  it("keeps unconfigured tiers visible without treating them as unresolved copies", () => {
    const inventory = enumerateRetirementCopies([
      copy(),
      copy({ id: "sync-replica", kind: "SYNC_REPLICA", label: "Sync replica", configured: false, disposition: "NOT_CONFIGURED", state: "NOT_CONFIGURED" })
    ]);
    expect(inventory.copies).toHaveLength(2);
    expect(inventory.unresolvedCopyIds).toEqual(["local-origin"]);
  });

  it("blocks hard clear while a configured remote copy is unresolved, then records local deletion", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-retirement-copies`);
    await store.open();
    await store.put(record("retirement-copy-record"));
    await store.recordExplicitDestroyIntent();
    const copies: RetirementCopyObservation[] = [
      copy(),
      copy({ id: "sync-replica", kind: "SYNC_REPLICA", label: "Sync replica", disposition: "REQUEST_ONLY" }),
      copy({ id: "off-origin-backup", kind: "OFF_ORIGIN_BACKUP", label: "Off-origin backup", disposition: "REQUEST_ONLY", state: "VERIFIED_DELETED" }),
      copy({ id: "remote-artifact-tier", kind: "REMOTE_ARTIFACT_TIER", label: "Remote artifact tier", disposition: "UNREACHABLE", state: "UNKNOWN" })
    ];
    await store.setRetirementCopyInventory(copies);
    await expect(store.clear("EXPLICIT_DESTROY_INTENT")).rejects.toThrow("configured remote copy");
    expect(await store.list()).toHaveLength(1);

    await store.setRetirementCopyInventory(copies.map((item) => item.id === "sync-replica" || item.id === "remote-artifact-tier"
      ? { ...item, disposition: "REQUEST_ONLY", state: "VERIFIED_DELETED" }
      : item));
    await store.clear("EXPLICIT_DESTROY_INTENT");
    expect(await store.list(true)).toEqual([]);
    expect((await store.getRetirementCopyInventory())?.status).toBe("READY");
    expect((await store.getRetirementCopyInventory())?.copies.find(({ id }) => id === "local-origin")?.state).toBe("VERIFIED_DELETED");
    store.close();
  });
});
