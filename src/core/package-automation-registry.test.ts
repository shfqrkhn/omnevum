import { describe, expect, it } from "vitest";
import { PackageAutomationRegistry } from "./package-automation-registry";
import { PackageRegistry, type PackageManifest } from "./package-contract";

const manifest: PackageManifest = {
  packageId: "sample.automation",
  version: "1.0.0",
  displayName: "Sample automation",
  trustClass: "DECLARATIVE",
  frameworkApi: "omnevum-sdk-1",
  entrypoints: ["declarative"],
  ownedCanonicalTypes: ["sample.automation.note"],
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
  ruleId: "sample.automation.review",
  version: 1,
  trigger: "ON_CAPTURE",
  when: { op: "eq", left: { kind: "path", path: "record.kind" }, right: { kind: "literal", value: "task" } },
  actions: [{ command: "record.update", arguments: { field: "priority", value: 3 } }],
  enabled: true
});

describe("package automation lifecycle", () => {
  it("previews only enabled rules from installed packages", () => {
    const packages = new PackageRegistry();
    packages.install(manifest);
    const registry = new PackageAutomationRegistry(packages);
    expect(registry.install(manifest.packageId, document)).toMatchObject({ packageId: manifest.packageId, ruleId: "sample.automation.review", status: "ENABLED" });
    expect(registry.preview("ON_CAPTURE", { record: { kind: "task" } })).toEqual([expect.objectContaining({ packageId: manifest.packageId, command: "record.update", requiresNormalCommandPath: true })]);
    expect(registry.preview("ON_OPEN", { record: { kind: "task" } })).toEqual([]);
  });

  it("suppresses disabled and package-disabled rules, then re-enables explicitly", () => {
    const packages = new PackageRegistry();
    packages.install(manifest);
    const registry = new PackageAutomationRegistry(packages);
    registry.install(manifest.packageId, document);
    registry.disable("sample.automation.review", "owner paused this rule");
    expect(registry.preview("ON_CAPTURE", { record: { kind: "task" } })).toEqual([]);
    expect(registry.get("sample.automation.review")).toMatchObject({ status: "DISABLED", disabledReason: "owner paused this rule" });
    registry.enable("sample.automation.review");
    expect(registry.preview("ON_CAPTURE", { record: { kind: "task" } })).toHaveLength(1);
    packages.disable(manifest.packageId, "package fault");
    expect(registry.preview("ON_CAPTURE", { record: { kind: "task" } })).toEqual([]);
    packages.retire(manifest.packageId);
    expect(registry.preview("ON_CAPTURE", { record: { kind: "task" } })).toEqual([]);
  });

  it("rejects duplicate rules and rules for unavailable packages", () => {
    const packages = new PackageRegistry();
    const registry = new PackageAutomationRegistry(packages);
    expect(() => registry.install(manifest.packageId, document)).toThrow("installed");
    packages.install(manifest);
    registry.install(manifest.packageId, document);
    expect(() => registry.install(manifest.packageId, document)).toThrow("already registered");
  });

  it("round-trips lifecycle state and skips rules whose package is unavailable", () => {
    const packages = new PackageRegistry();
    packages.install(manifest);
    const registry = new PackageAutomationRegistry(packages);
    registry.install(manifest.packageId, document);
    registry.disable("sample.automation.review", "owner paused this rule");

    const state = registry.exportState();
    expect(state).toHaveLength(1);
    const restored = new PackageAutomationRegistry(packages);
    expect(restored.restoreState(state)).toEqual({ restored: 1, skipped: 0 });
    expect(restored.get("sample.automation.review")).toMatchObject({ status: "DISABLED", disabledReason: "owner paused this rule" });
    expect(restored.preview("ON_CAPTURE", { record: { kind: "task" } })).toEqual([]);

    const unavailable = new PackageAutomationRegistry(new PackageRegistry());
    expect(unavailable.restoreState(state)).toEqual({ restored: 0, skipped: 1 });
    expect(unavailable.list()).toEqual([]);
  });
});
