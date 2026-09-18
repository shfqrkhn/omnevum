import { describe, expect, it } from "vitest";
import { CommandBus } from "./commands";
import { CanonicalStore } from "./storage";

describe("source-preserving Artifact transformations", () => {
  it("creates a derived artifact with explicit source revision lineage", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-derived-artifact`);
    await store.open();
    const commands = new CommandBus(store);
    const source = await commands.createArtifact({ fileName: "source.txt", mimeType: "text/plain", blob: new Blob(["source"]) });
    const derived = await commands.createDerivedArtifact({ sourceId: source.id, operation: "redact-preview", fileName: "derived.txt", mimeType: "text/plain", blob: new Blob(["derived"]) });
    expect(derived.truthClass).toBe("DERIVED");
    expect(derived.data.derivedFrom).toEqual({ recordId: source.id, revision: source.revision });
    expect(await store.getArtifact(source.id)).toBeDefined();
    store.close();
  });

  it("keeps one artifact payload shared by multiple references while rebuilding derived search", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-artifact-references`);
    await store.open();
    const commands = new CommandBus(store);
    const artifact = await commands.createArtifact({ fileName: "receipt.txt", mimeType: "text/plain", blob: new Blob(["receipt source"]) });
    const expense = await commands.create({ recordType: "note", owner: "core.capture", data: { text: "Receipt expense" } });
    const claim = await commands.create({ recordType: "note", owner: "core.capture", data: { text: "Receipt claim" } });

    await commands.relate(artifact.id, expense.id, "supports");
    await commands.relate(artifact.id, claim.id, "supports");

    const references = (await store.list()).filter((record) => record.owner === "platform.relate" && record.data.sourceId === artifact.id);
    expect(references).toHaveLength(2);
    expect(new Set(references.map((record) => record.data.sourceId))).toEqual(new Set([artifact.id]));
    expect(await (await store.getArtifact(artifact.id))?.text()).toBe("receipt source");

    await store.invalidateSearchIndex();
    expect((await store.health()).searchIndexValid).toBe(false);
    await store.rebuildSearchIndex();
    expect((await store.health()).searchIndexValid).toBe(true);
    expect(await (await store.getArtifact(artifact.id))?.text()).toBe("receipt source");
    store.close();
  });
});
