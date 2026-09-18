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
