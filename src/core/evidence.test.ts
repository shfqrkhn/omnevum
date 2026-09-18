import { describe, expect, it } from "vitest";
import { CommandBus } from "./commands";
import { createEvidenceLink } from "./evidence";
import { CanonicalStore } from "./storage";

describe("Evidence links", () => {
  it("stores source claims as separate reference records", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-evidence`);
    await store.open();
    const commands = new CommandBus(store);
    const subject = await commands.create({ recordType: "note", owner: "core.capture", data: { text: "claim" } });
    const source = await commands.create({ recordType: "artifact", owner: "platform.artifact", data: { text: "source", mimeType: "text/plain", blobRef: "source" } });
    const link = await createEvidenceLink(commands, { subjectId: subject.id, sourceId: source.id, relation: "SUPPORTS", claim: "The source supports this claim", uncertainty: "medium" });
    expect(link).toMatchObject({ owner: "platform.evidence", truthClass: "SOURCE_CLAIM", data: { kind: "evidence-link", subjectId: subject.id, sourceId: source.id } });
    store.close();
  });
});
