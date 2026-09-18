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
});
