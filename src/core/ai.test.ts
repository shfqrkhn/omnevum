import { describe, expect, it } from "vitest";
import { AiBroker, AiRouteRegistry, ContextBroker, type AiProvider } from "./ai";
import type { CanonicalRecord } from "./model";

function record(id: string, sensitivity: "PRIVATE" | "SHARED" = "PRIVATE"): CanonicalRecord {
  const now = new Date().toISOString();
  return { id, recordType: "note", owner: "core.capture", schemaVersion: 1, createdAt: now, modifiedAt: now, provenance: { source: "USER_INPUT", capturedAt: now }, truthClass: "USER_OBSERVATION", sensitivity, revision: 1, deleted: false, data: { text: id, accessToken: "never" } };
}

const provider: AiProvider = { run: async (_operation, context) => JSON.stringify(context.records.map((item) => item.data.text)) };

describe("optional shared AI broker", () => {
  it("uses explicit context for two operations without exposing secret-shaped fields", async () => {
    const registry = new AiRouteRegistry();
    registry.register({ id: "local-test", label: "Local test", operations: ["SUMMARIZE", "CLASSIFY", "SUGGEST"], costClass: "LOCAL_NO_MARGINAL_COST", status: "ENABLED" });
    const broker = new AiBroker(registry);
    const context = new ContextBroker().project({ purpose: "summarize selected notes", recordIds: ["one"], operation: "SUMMARIZE", routeId: "local-test", disclosureClass: "PRIVATE", expectedOutput: "TEXT" }, [record("one")]);
    expect(context.records[0]?.data.accessToken).toBeUndefined();
    await expect(broker.run({ purpose: "summarize selected notes", recordIds: ["one"], operation: "SUMMARIZE", routeId: "local-test", disclosureClass: "PRIVATE", expectedOutput: "TEXT" }, [record("one")], provider)).resolves.toMatchObject({ truthClass: "DERIVED", provenance: { sourceIds: ["one"] } });
    await expect(broker.run({ purpose: "classify selected notes", recordIds: ["one"], operation: "CLASSIFY", routeId: "local-test", disclosureClass: "PRIVATE", expectedOutput: "TEXT" }, [record("one")], provider)).resolves.toMatchObject({ truthClass: "DERIVED" });
  });

  it("rejects public disclosure, disabled routes, and proposal bypasses", () => {
    const registry = new AiRouteRegistry();
    registry.register({ id: "blocked", label: "Blocked", operations: ["SUMMARIZE"], costClass: "SUBSCRIPTION_INCLUDED", status: "TERMS_BLOCKED" });
    const broker = new AiBroker(registry);
    expect(() => new ContextBroker().project({ purpose: "bad", recordIds: ["private"], operation: "SUMMARIZE", routeId: "blocked", disclosureClass: "PUBLIC", expectedOutput: "TEXT" }, [record("private")])).toThrow("public");
    expect(() => registry.choose("blocked", "SUMMARIZE")).toThrow("unavailable");
    const context = { purpose: "proposal", operation: "SUGGEST" as const, disclosureClass: "PRIVATE" as const, records: [{ id: "private", recordType: "note" as const, owner: "core", truthClass: "USER_OBSERVATION" as const, data: {} }] };
    expect(() => broker.proposal({ purpose: "proposal", recordIds: ["private"], operation: "SUMMARIZE", routeId: "blocked", disclosureClass: "PRIVATE", expectedOutput: "TEXT" }, context, { command: "canonical.write", arguments: {} })).toThrow("proposal operation");
  });
});
