import { describe, expect, it } from "vitest";
import { CommandBus } from "./commands";
import { evaluateOwnershipBoundary, V018_LAUNCHPAD_FLOWS, canonicalOwnerForFlow, validateCanonicalFlowInput, type V018LaunchpadFlow } from "./launchpad-transplant";
import { CanonicalStore } from "./storage";

type WorkloadCase = {
  flow: V018LaunchpadFlow;
  sourceId: string;
  recordId: string;
  recordType: "note" | "task" | "observation" | "artifact";
  text: string;
};

const WORKLOAD: readonly WorkloadCase[] = [
  { flow: "Note/Knowledge", sourceId: "neumanos:note:42", recordId: "omnevum:launchpad:note-42", recordType: "note", text: "OMNEVUM launchpad note retained" },
  { flow: "Task/Project", sourceId: "neumanos:task:17", recordId: "omnevum:launchpad:task-17", recordType: "task", text: "OMNEVUM launchpad task retained" },
  { flow: "Calendar/Time", sourceId: "neumanos:event:2026-09-19", recordId: "omnevum:launchpad:event-2026-09-19", recordType: "observation", text: "OMNEVUM launchpad calendar event retained" },
  { flow: "Habit/Routine", sourceId: "neumanos:habit:walk", recordId: "omnevum:launchpad:habit-walk", recordType: "observation", text: "OMNEVUM launchpad routine retained" },
  { flow: "Document/Artifact", sourceId: "neumanos:document:receipt-7", recordId: "omnevum:launchpad:artifact-receipt-7", recordType: "artifact", text: "OMNEVUM launchpad artifact retained" },
  { flow: "Automation", sourceId: "neumanos:automation:review", recordId: "omnevum:launchpad:automation-review", recordType: "observation", text: "OMNEVUM launchpad automation retained" }
];

describe("v0.18 OMN-FOSS-014 canonical-core workload", () => {
  it("runs all six retained flows through command ownership and reconstructs them from Vault", async () => {
    expect(WORKLOAD.map(({ flow }) => flow)).toEqual([...V018_LAUNCHPAD_FLOWS]);
    for (const item of WORKLOAD) {
      const owner = canonicalOwnerForFlow(item.flow);
      expect(evaluateOwnershipBoundary([{ storeId: `legacy:${item.flow}`, flow: item.flow, writable: true, owner: `legacy.${item.flow}` }], item.flow).accepted).toBe(false);
      expect(evaluateOwnershipBoundary([{ storeId: `retained:${item.flow}`, flow: item.flow, writable: false, owner }], item.flow).accepted).toBe(true);
    }

    const source = new CanonicalStore(`omnevum-test-${Date.now()}-launchpad-source`);
    const destination = new CanonicalStore(`omnevum-test-${Date.now()}-launchpad-destination`);
    await source.open();
    await destination.open();
    try {
      const commands = new CommandBus(source);
      const accepted = [];
      for (const item of WORKLOAD) {
        const mutation = validateCanonicalFlowInput({
          flow: item.flow,
          sourceId: item.sourceId,
          recordId: item.recordId,
          revision: 1,
          data: { text: item.text, launchpadFlow: item.flow, stableSourceId: item.sourceId, stableCanonicalId: item.recordId }
        });
        const created = item.recordType === "artifact"
          ? await commands.createArtifact({
            id: mutation.recordId,
            fileName: "launchpad-receipt.txt",
            mimeType: "text/plain",
            blob: new Blob([item.text], { type: "text/plain" }),
            sourceId: mutation.sourceId,
            adapter: "TEXT",
            metadata: mutation.data
          })
          : item.flow === "Automation"
            ? await commands.create({
              id: mutation.recordId,
              recordType: item.recordType,
              owner: mutation.owner,
              truthClass: "IMPORTED_RECORD",
              provenance: { source: "IMPORT", sourceId: mutation.sourceId },
              data: mutation.data
            })
            : item.flow === "Document/Artifact"
              ? await commands.createArtifact({
                id: mutation.recordId,
                fileName: "launchpad-receipt.txt",
                mimeType: "text/plain",
                blob: new Blob([item.text], { type: "text/plain" }),
                sourceId: mutation.sourceId,
                adapter: "TEXT",
                metadata: mutation.data
              })
            : await commands.createLaunchpad({
              flow: item.flow,
              text: item.text,
              sourceId: mutation.sourceId,
              recordId: mutation.recordId,
              data: mutation.data
            });
        const updated = await commands.update(created.id, { ...created.data, canonicalOwnerMutation: "record.update" }, created.revision);
        expect(updated.id).toBe(item.recordId);
        expect(updated.owner).toBe(mutation.owner);
        expect(updated.provenance.sourceId).toBe(item.sourceId);
        expect(updated.revision).toBe(2);
        accepted.push(updated);
      }

      expect(await source.search("launchpad")).toHaveLength(WORKLOAD.length);
      const vault = await source.exportVault();
      expect(vault.records.map((record) => record.id).sort()).toEqual(WORKLOAD.map(({ recordId }) => recordId).sort());
      expect(vault.history).toHaveLength(WORKLOAD.length * 2);
      expect(await destination.importVault(vault)).toEqual({ imported: WORKLOAD.length, skipped: 0, conflicts: 0 });
      expect(await destination.importVault(vault)).toEqual({ imported: 0, skipped: WORKLOAD.length, conflicts: 0 });

      for (const item of WORKLOAD) {
        const restored = (await destination.list()).filter((record) => record.provenance.sourceId === item.sourceId);
        expect(restored).toHaveLength(1);
        expect(restored[0]).toMatchObject({ id: item.recordId, owner: canonicalOwnerForFlow(item.flow), revision: 2 });
        if (item.recordType === "artifact") {
          expect(restored[0]?.data.adapterMetadata).toMatchObject({ stableCanonicalId: item.recordId, stableSourceId: item.sourceId });
        } else {
          expect(restored[0]?.data).toMatchObject({ stableCanonicalId: item.recordId, stableSourceId: item.sourceId });
        }
      }
      expect(await destination.search("launchpad")).toHaveLength(WORKLOAD.length);
      expect((await destination.exportRetainedState()).format).toBe("OMNEVUM_VAULT");
      await expect(commands.create({ id: accepted[0]!.id, recordType: "note", owner: "core.knowledge", data: { text: "duplicate authority" } })).rejects.toThrow("revision conflict");
    } finally {
      source.close();
      destination.close();
    }
  });
});
