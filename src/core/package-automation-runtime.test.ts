import { describe, expect, it } from "vitest";
import { CommandBus } from "./commands";
import { CanonicalStore } from "./storage";
import { PackageAutomationRegistry } from "./package-automation-registry";
import { PackageAutomationRuntime, type PackageAutomationStateStore } from "./package-automation-runtime";
import { PackageRegistry, type PackageManifest } from "./package-contract";
import type { VaultPackageAutomation } from "./model";

const manifest: PackageManifest = {
  packageId: "runtime.automation",
  version: "1.0.0",
  displayName: "Runtime automation",
  trustClass: "DECLARATIVE",
  frameworkApi: "omnevum-sdk-1",
  entrypoints: ["declarative"],
  ownedCanonicalTypes: ["runtime.automation.note"],
  commands: { consumes: ["record.update"], provides: [] },
  capabilities: { required: ["record"], optional: ["automation"] },
  permissions: ["automation.proposal"],
  externalEffects: [],
  dataSchema: "schema-1",
  migrations: [],
  lifecycle: { offline: "local", recovery: "disable", rollback: "previous", uninstall: "retain-export", retirement: "stop" },
  accessibility: "WCAG-2.2-AA",
  inputProfile: ["touch", "keyboard"],
  localization: ["en-CA"]
};

const document = JSON.stringify({
  schemaVersion: 1,
  ruleId: "runtime.automation.review",
  version: 1,
  trigger: "ON_CAPTURE",
  when: { op: "exists", path: "record.kind" },
  actions: [{ command: "record.update", arguments: { field: "priority", value: 3 } }],
  enabled: true
});

function fakeStore(initial: VaultPackageAutomation[] = []): PackageAutomationStateStore & { value: () => VaultPackageAutomation[]; failWrites: boolean } {
  let state = structuredClone(initial);
  return {
    failWrites: false,
    async getAutomationRules() { return structuredClone(state); },
    async setAutomationRules(rules) {
      if (this.failWrites) throw new Error("synthetic automation persistence failure");
      state = structuredClone(rules);
    },
    value() { return structuredClone(state); }
  };
}

describe("package automation runtime persistence", () => {
  it("restores Vault state and persists lifecycle mutations", async () => {
    const packages = new PackageRegistry();
    packages.install(manifest);
    const store = fakeStore();
    const runtime = new PackageAutomationRuntime(new PackageAutomationRegistry(packages), store);
    await runtime.install(manifest.packageId, document);
    expect(store.value()).toHaveLength(1);

    const restored = new PackageAutomationRuntime(new PackageAutomationRegistry(packages), store);
    expect(await restored.restore()).toEqual({ restored: 1, skipped: 0 });
    await restored.disable("runtime.automation.review", "owner paused this rule");
    expect(store.value()[0]).toMatchObject({ status: "DISABLED", disabledReason: "owner paused this rule" });
    expect(restored.preview("ON_CAPTURE", { record: { kind: "task" } })).toEqual([]);
  });

  it("rolls back an in-memory lifecycle mutation when durable persistence fails", async () => {
    const packages = new PackageRegistry();
    packages.install(manifest);
    const store = fakeStore();
    const runtime = new PackageAutomationRuntime(new PackageAutomationRegistry(packages), store);
    await runtime.install(manifest.packageId, document);
    store.failWrites = true;
    await expect(runtime.disable("runtime.automation.review", "storage unavailable")).rejects.toThrow("persistence failure");
    expect(runtime.list("runtime.automation")).toMatchObject([{ status: "ENABLED" }]);
    expect(store.value()).toMatchObject([{ status: "ENABLED" }]);
  });

  it("re-checks lifecycle ownership and applies a confirmed proposal through CommandBus", async () => {
    const canonical = new CanonicalStore(`omnevum-test-${Date.now()}-package-automation-apply`);
    await canonical.open();
    const commands = new CommandBus(canonical);
    const record = await commands.create({ recordType: "note", owner: "core.capture", data: { text: "automation target" } });
    const packages = new PackageRegistry();
    packages.install(manifest);
    const store = fakeStore();
    const runtime = new PackageAutomationRuntime(new PackageAutomationRegistry(packages), store);
    const manualDocument = JSON.stringify({
      schemaVersion: 1,
      ruleId: "runtime.automation.manual",
      version: 1,
      trigger: "MANUAL",
      when: { op: "exists", path: "record.id" },
      actions: [{ command: "record.update", arguments: { recordId: record.id, field: "automationReviewed", value: true } }],
      enabled: true
    });
    await runtime.install(manifest.packageId, manualDocument);
    const [proposal] = runtime.preview("MANUAL", { record: { id: record.id } });
    expect(proposal).toBeDefined();
    const updated = await runtime.apply(commands, proposal!, { confirmed: true, allowedRecordIds: new Set([record.id]) });
    expect(updated).toMatchObject({ id: record.id, data: { automationReviewed: true } });
    await runtime.disable("runtime.automation.manual", "test lifecycle stop");
    await expect(runtime.apply(commands, proposal!, { confirmed: true, allowedRecordIds: new Set([record.id]) })).rejects.toThrow("stale");
    canonical.close();
  });
});
