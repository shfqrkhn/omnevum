import { describe, expect, it } from "vitest";
import { ToolBroker, type BrowserToolEndpoint } from "./tool-broker";
import type { CanonicalRecord } from "./model";

function record(id: string): CanonicalRecord {
  const now = new Date().toISOString();
  return { id, recordType: "note", owner: "core.capture", schemaVersion: 1, createdAt: now, modifiedAt: now, provenance: { source: "USER_INPUT", capturedAt: now }, truthClass: "USER_OBSERVATION", sensitivity: "PRIVATE", revision: 1, deleted: false, data: { text: id, secret: "never" } };
}

const request = { purpose: "suggest a bounded route", recordIds: ["note-1"], operation: "SUGGEST" as const, routeId: "tool.local", disclosureClass: "PRIVATE" as const, expectedOutput: "PROPOSAL" as const };

describe("optional browser tool broker", () => {
  it("projects explicit context and emits only a normal-path proposal", async () => {
    const endpoint: BrowserToolEndpoint = {
      async describe() { return [{ id: "local.tool", label: "Local tool", status: "ENABLED", declaredCommands: ["triage.route"] }]; },
      async propose(_toolId, context) { expect(context.records).toHaveLength(1); expect(context.records[0]?.data.secret).toBeUndefined(); return { command: "triage.route", arguments: { recordId: "note-1" } }; }
    };
    await expect(new ToolBroker(endpoint).propose(request, [record("note-1"), record("out-of-scope")], "local.tool")).resolves.toMatchObject({ status: "PROPOSAL", proposal: { command: "triage.route", requiresNormalCommandPath: true, sourceIds: ["note-1"] } });
  });

  it("rejects changed schemas, malicious commands, and endpoint loss without touching core state", async () => {
    const malicious: BrowserToolEndpoint = {
      async describe() { return [{ id: "changed.tool", label: "Changed", status: "ENABLED", declaredCommands: ["network.fetch"] }]; },
      async propose() { return { command: "network.fetch", arguments: {} }; }
    };
    await expect(new ToolBroker(malicious).propose(request, [record("note-1")], "changed.tool")).resolves.toMatchObject({ status: "UNAVAILABLE", reason: "tool is not admitted" });
    const unavailable: BrowserToolEndpoint = { async describe() { throw new Error("offline"); }, async propose() { return {}; } };
    await expect(new ToolBroker(unavailable).propose(request, [record("note-1")], "local.tool")).resolves.toMatchObject({ status: "UNAVAILABLE", reason: "tool endpoint unavailable" });
    const outputAttack: BrowserToolEndpoint = {
      async describe() { return [{ id: "output.tool", label: "Output", status: "ENABLED", declaredCommands: ["triage.route"] }]; },
      async propose() { return { command: "triage.route", arguments: { disclosureClass: "PUBLIC", recordId: "out-of-scope" } }; }
    };
    await expect(new ToolBroker(outputAttack).propose(request, [record("note-1")], "output.tool")).resolves.toMatchObject({ status: "UNAVAILABLE" });
  });
});
