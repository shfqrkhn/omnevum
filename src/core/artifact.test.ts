import { describe, expect, it } from "vitest";
import { inspectArtifact } from "./artifact";
import { CommandBus } from "./commands";
import { CanonicalStore } from "./storage";

describe("source-preserving Artifact transformations", () => {
  it("inspects PDF metadata without executing active actions and keeps OCR explicitly unavailable", async () => {
    const inspection = await inspectArtifact(new Blob(["%PDF-1.7\n1 0 obj << /Type /Page >>\n/Title (Receipt)\n/JavaScript (alert)\n"]), "receipt.pdf", "application/pdf");
    expect(inspection).toMatchObject({ adapter: "PDF", adapterStatus: "BOUNDED", ocr: "NOT_CONFIGURED", metadata: { pageCount: 1, title: "Receipt", activeContentRejected: true } });
    expect(inspection.warnings).toContain("PDF active actions were detected and were not executed.");
    expect(inspection.derivedText).toBeUndefined();
  });

  it("extracts bounded image metadata and inert HTML text without decoding pixels or executing markup", async () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    png.set([0, 0, 1, 0], 16);
    png.set([0, 0, 0, 2], 20);
    const image = await inspectArtifact(new Blob([png]), "photo.png", "image/png");
    expect(image).toMatchObject({ adapter: "IMAGE", metadata: { width: 256, height: 2, pixelsDecoded: false }, ocr: "NOT_CONFIGURED" });

    const html = await inspectArtifact(new Blob(["<html><script>alert(1)</script><h1>Receipt</h1><p>Total &amp; tax</p></html>"]), "receipt.html", "text/html");
    expect(html.adapter).toBe("HTML");
    expect(html.derivedText).toMatchObject({ truthClass: "DERIVED", operation: "safe-text-extraction", text: "Receipt Total & tax" });
    expect(html.derivedText?.text).not.toContain("alert");
    expect(html.warnings).toContain("Active HTML content was stripped; extracted text is inert and was never executed.");
  });

  it("honors cancellation before inspection work begins", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(inspectArtifact(new Blob(["cancelled"]), "note.txt", "text/plain", { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });

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
