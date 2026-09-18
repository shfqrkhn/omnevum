import { describe, expect, it } from "vitest";
import { acceptCandidates, stageBlob, stageText, stageUrl } from "./acquire";
import { CommandBus } from "./commands";
import { CanonicalStore } from "./storage";

describe("Acquire/Ingest", () => {
  it("stages heterogeneous JSON for review and preserves source identity", async () => {
    const preview = await stageText(JSON.stringify([{ type: "task", title: "Ship", owner: "untrusted" }, { kind: "measurement", name: "Sleep", value: 7.5 }]), { name: "export.json", mimeType: "application/json" });
    expect(preview.source.sourceId).toMatch(/^source:[a-f0-9]{64}$/);
    expect(preview.candidates).toHaveLength(2);
    expect(preview.candidates[0]).toMatchObject({ recordType: "task", kind: "task", confidence: "HIGH" });
    expect(preview.candidates[1]).toMatchObject({ recordType: "observation", kind: "measurement", confidence: "REVIEW" });
    expect(preview.candidates[0]?.data.sourceFields).toBeDefined();
  });

  it("routes heterogeneous event, artifact, and location candidates to existing owners", async () => {
    const preview = await stageText(JSON.stringify([
      { type: "event", title: "Trip start", start: "2026-09-18T09:00:00Z" },
      { type: "artifact", name: "receipt.pdf", mimeType: "application/pdf" },
      { type: "location", name: "Home", latitude: 45.42, longitude: -75.69 },
      { type: "person", name: "Ada" }
    ]), { name: "heterogeneous-export.json", mimeType: "application/json" });
    expect(preview.candidates.map((candidate) => [candidate.recordType, candidate.owner])).toEqual([
      ["observation", "platform.time"],
      ["artifact", "platform.artifact"],
      ["observation", "platform.place"],
      ["note", "core.acquire"]
    ]);
    expect(preview.candidates.every((candidate) => candidate.data.sourceId === preview.source.sourceId)).toBe(true);
    expect(preview.candidates.map((candidate) => candidate.sequence)).toEqual([1, 2, 3, 4]);
  });

  it("maps bounded GPX waypoints and track points to Place and Time owners", async () => {
    const preview = await stageBlob(new Blob([`<?xml version="1.0"?><gpx><wpt lat="43.6532" lon="-79.3832"><name>Toronto &amp; home</name></wpt><trk><trkseg><trkpt lat="43.7" lon="-79.4"><time>2026-09-18T12:00:00Z</time></trkpt></trkseg></trk></gpx>`]), "walk.gpx", "application/gpx+xml");
    expect(preview.source.format).toBe("GPX");
    expect(preview.candidates).toHaveLength(2);
    expect(preview.candidates.map((candidate) => [candidate.recordType, candidate.owner])).toEqual([
      ["observation", "platform.place"],
      ["observation", "platform.time"]
    ]);
    expect(preview.candidates[0]?.data).toMatchObject({ text: "Toronto & home", latitude: 43.6532, longitude: -79.3832 });
    expect(preview.candidates[1]?.data).toMatchObject({ start: "2026-09-18T12:00:00Z", latitude: 43.7, longitude: -79.4 });
    expect(preview.candidates.every((candidate) => candidate.data.sourceId === preview.source.sourceId)).toBe(true);
  });

  it("stages a PDF as one source-preserving Artifact candidate and retains its payload on acceptance", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-acquire-pdf`);
    await store.open();
    const commands = new CommandBus(store);
    const preview = await stageBlob(new Blob(["%PDF-1.7\n/Type /Page\n/Title (Receipt)\n/JavaScript (ignored)"]), "receipt.pdf", "application/pdf");
    expect(preview.source.format).toBe("PDF");
    expect(preview.candidates[0]).toMatchObject({ recordType: "artifact", owner: "platform.artifact", data: { artifactAdapter: "PDF", adapterStatus: "BOUNDED" } });
    expect(preview.warnings).toContain("PDF active actions were detected and were not executed.");
    expect(await acceptCandidates(commands, preview.candidates)).toMatchObject({ accepted: 1, skipped: 0 });
    expect(await acceptCandidates(commands, preview.candidates)).toMatchObject({ accepted: 0, skipped: 1 });
    const record = (await store.list())[0];
    expect(record).toMatchObject({ owner: "platform.artifact", provenance: { source: "IMPORT", sourceId: preview.candidates[0]?.sourceId }, data: { adapter: "PDF" } });
    expect((await store.getArtifact(record?.id ?? ""))?.size).toBeGreaterThan(0);
    store.close();
  });

  it("accepts candidates through the command owner and makes repetition idempotent", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-acquire`);
    await store.open();
    const commands = new CommandBus(store);
    const preview = await stageBlob(new Blob(["text,kind\nhello,note\n"]), "export.csv", "text/csv");
    expect(await acceptCandidates(commands, preview.candidates)).toMatchObject({ accepted: 1, skipped: 0 });
    expect(await acceptCandidates(commands, preview.candidates)).toMatchObject({ accepted: 0, skipped: 1 });
    expect((await store.list())[0]?.provenance.source).toBe("IMPORT");
    store.close();
  });

  it("keeps URLs bounded and refuses non-web schemes", async () => {
    expect((await stageUrl("https://example.test/article")).candidates[0]?.kind).toBe("url");
    await expect(stageUrl("javascript:alert(1)")).rejects.toThrow("HTTP or HTTPS");
    await expect(stageUrl("https://user:password@example.test/article")).rejects.toThrow("embedded credentials");
    await expect(stageUrl(`https://example.test/${"x".repeat(4096)}`)).rejects.toThrow("4 KiB");
  });

  it("keeps hostile-looking imported text inert and removes secret-shaped fields", async () => {
    const preview = await stageText(JSON.stringify({ kind: "note", text: "<img src=x onerror=alert(1)>", accessToken: "do-not-retain" }), { name: "untrusted.json", mimeType: "application/json" });
    const candidate = preview.candidates[0];
    expect(candidate?.data.text).toBe("<img src=x onerror=alert(1)>");
    expect(candidate?.data.sourceFields).toEqual({ kind: "note", text: "<img src=x onerror=alert(1)>" });
  });
});
