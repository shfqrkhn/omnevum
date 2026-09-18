import { describe, expect, it } from "vitest";
import { redactTextArtifact } from "./document";

describe("bounded local document finishing", () => {
  it("redacts literal terms from text without mutating the source or uploading it", async () => {
    const source = new Blob(["Invoice for Alice\nAccount: 1234\nAlice approved"], { type: "text/plain" });
    const result = await redactTextArtifact(source, "invoice.txt", "text/plain", ["Alice", "1234"]);

    expect(await source.text()).toBe("Invoice for Alice\nAccount: 1234\nAlice approved");
    expect(result).toMatchObject({ sourceAdapter: "TEXT", fileName: "invoice.redacted.txt", mimeType: "text/plain", redactedCount: 3 });
    await expect(result.blob.text()).resolves.toBe("Invoice for [REDACTED]\nAccount: [REDACTED]\n[REDACTED] approved");
    expect(result.sourceSha256).toHaveLength(64);
  });

  it("uses inert extracted HTML text and never carries active markup into the derived artifact", async () => {
    const result = await redactTextArtifact(new Blob(["<h1>Invoice</h1><script>Invoice</script><p>Alice</p>"], { type: "text/html" }), "invoice.html", "text/html", ["Invoice", "Alice"], "[REMOVED]");

    expect(result.sourceAdapter).toBe("HTML");
    await expect(result.blob.text()).resolves.toBe("[REMOVED] [REMOVED]");
    expect(result.warnings).toContain("Active HTML content was stripped; extracted text is inert and was never executed.");
  });

  it("rejects unsupported, truncated, unmatched, and cancelled transformations", async () => {
    await expect(redactTextArtifact(new Blob([new Uint8Array([0, 1, 2])]), "data.bin", "application/octet-stream", ["1"])).rejects.toThrow("only bounded text");
    await expect(redactTextArtifact(new Blob(["x".repeat(20_001)], { type: "text/plain" }), "large.txt", "text/plain", ["x"])).rejects.toThrow("bounded to 20,000");
    await expect(redactTextArtifact(new Blob(["safe text"], { type: "text/plain" }), "safe.txt", "text/plain", ["missing"])).rejects.toThrow("None of the redaction terms");
    const controller = new AbortController();
    controller.abort();
    await expect(redactTextArtifact(new Blob(["cancelled"], { type: "text/plain" }), "cancelled.txt", "text/plain", ["cancelled"], undefined, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});
