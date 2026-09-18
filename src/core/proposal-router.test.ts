import { describe, expect, it } from "vitest";
import { CommandBus } from "./commands";
import { applyConfirmedProposal } from "./proposal-router";
import { CanonicalStore } from "./storage";

function proposal(command: string, argumentsValue: Record<string, string | number | boolean | null>) {
  return { command, arguments: argumentsValue, ruleId: "sample.automation.rule", requiresNormalCommandPath: true as const };
}

describe("confirmed proposal router", () => {
  it("requires explicit confirmation and an authorized record scope", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-proposal-router-auth`);
    await store.open();
    const commands = new CommandBus(store);
    const record = await commands.create({ recordType: "note", owner: "core.capture", data: { text: "before" } });
    const update = proposal("record.update", { recordId: record.id, field: "status", value: "DONE", expectedRevision: record.revision });
    await expect(applyConfirmedProposal(commands, update, { confirmed: false, allowedRecordIds: new Set([record.id]) })).rejects.toThrow("explicit confirmation");
    await expect(applyConfirmedProposal(commands, update, { confirmed: true, allowedRecordIds: new Set() })).rejects.toThrow("outside the authorized context");
    expect((await commands.get(record.id))?.data.status).toBeUndefined();
    store.close();
  });

  it("applies safe updates through CommandBus and rejects authority fields", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-proposal-router-update`);
    await store.open();
    const commands = new CommandBus(store);
    const record = await commands.create({ recordType: "note", owner: "core.capture", data: { text: "before" } });
    const scope = new Set([record.id]);
    await expect(applyConfirmedProposal(commands, proposal("record.update", { recordId: record.id, field: "owner", value: "unsafe" }), { confirmed: true, allowedRecordIds: scope })).rejects.toThrow("authority fields");
    const updated = await applyConfirmedProposal(commands, proposal("record.update", { recordId: record.id, field: "status", value: "DONE", expectedRevision: record.revision }), { confirmed: true, allowedRecordIds: scope });
    expect(updated).toMatchObject({ id: record.id, revision: 2, data: { text: "before", status: "DONE" } });
    store.close();
  });

  it("routes supported triage proposals and fails closed for unsupported structure", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-proposal-router-triage`);
    await store.open();
    const commands = new CommandBus(store);
    const source = await commands.create({ recordType: "note", owner: "core.capture", data: { text: "defer me", triageStatus: "INBOX" } });
    const scope = new Set([source.id]);
    await expect(applyConfirmedProposal(commands, proposal("triage.defer", { sourceId: source.id, deferredUntil: "2030-01-01T00:00:00.000Z", expectedRevision: source.revision }), { confirmed: true, allowedRecordIds: scope })).resolves.toMatchObject({ id: source.id, data: { triageStatus: "DEFERRED" } });
    await expect(applyConfirmedProposal(commands, proposal("record.create", { owner: "core.capture" }), { confirmed: true, allowedRecordIds: scope })).rejects.toThrow("specialized normal handler");
    store.close();
  });
});
