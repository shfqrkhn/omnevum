import { describe, expect, it } from "vitest";
import { CommandBus } from "./commands";
import { CanonicalStore } from "./storage";
import { canUseShareGrant, createShareGrant, revokeShareGrant } from "./sharing";

describe("purpose-bound sharing grants", () => {
  it("authorizes only the declared record set and stops after revocation", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-sharing`);
    await store.open();
    const commands = new CommandBus(store);
    const source = await commands.create({ recordType: "note", owner: "core.capture", data: { text: "source" } });
    const other = await commands.create({ recordType: "note", owner: "core.capture", data: { text: "other" } });
    const grant = await createShareGrant(commands, { grantedTo: "person:friend", purpose: "shared planning", space: "personal", recordIds: [source.id] });
    expect(grant.data.triageStatus).toBe("REVIEWED");
    expect(canUseShareGrant(grant, [source.id])).toBe(true);
    expect(canUseShareGrant(grant, [source.id, other.id])).toBe(false);
    const revoked = await revokeShareGrant(commands, grant.id);
    expect(canUseShareGrant(revoked, [source.id])).toBe(false);
    expect(await store.get(source.id)).toEqual(source);
    store.close();
  });
});
