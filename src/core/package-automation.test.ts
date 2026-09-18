import { describe, expect, it } from "vitest";
import { createPackageAutomationAdapter, parsePackageAutomationDocument } from "./package-automation";
import type { AutomationRule } from "./automation";
import type { PackageManifest } from "./package-contract";

const manifest: PackageManifest = {
  packageId: "sample.app",
  version: "1.0.0",
  displayName: "Sample",
  trustClass: "DECLARATIVE",
  frameworkApi: "omnevum-sdk-1",
  entrypoints: ["declarative"],
  ownedCanonicalTypes: ["sample.note"],
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

const rule: AutomationRule = {
  schemaVersion: 1,
  ruleId: "sample.app.review",
  version: 1,
  trigger: "ON_CAPTURE",
  when: { op: "eq", left: { kind: "path", path: "record.kind" }, right: { kind: "literal", value: "task" } },
  actions: [{ command: "record.update", arguments: { field: "priority", value: 3 } }],
  enabled: true
};

describe("package-facing bounded automation", () => {
  it("parses a bounded package rule and emits proposal-only actions", () => {
    const adapter = parsePackageAutomationDocument(manifest, JSON.stringify(rule));
    expect(adapter.preview({ record: { kind: "task" } })).toEqual([{ command: "record.update", arguments: { field: "priority", value: 3 }, ruleId: "sample.app.review", requiresNormalCommandPath: true }]);
  });

  it("requires package scope, declared permission, and consumed commands", () => {
    expect(() => createPackageAutomationAdapter({ ...manifest, permissions: [] }, rule)).toThrow("permission");
    expect(() => createPackageAutomationAdapter({ ...manifest, packageId: "other.app" }, rule)).toThrow("package-scoped");
    expect(() => createPackageAutomationAdapter({ ...manifest, commands: { consumes: [], provides: [] } }, rule)).toThrow("declared");
    expect(() => createPackageAutomationAdapter({ ...manifest, trustClass: "EXECUTABLE_UNQUALIFIED" }, rule)).toThrow("isolation");
  });

  it("rejects malformed or oversized documents before adapter creation", () => {
    expect(() => parsePackageAutomationDocument(manifest, "not-json")).toThrow("valid JSON");
    expect(() => parsePackageAutomationDocument(manifest, "x".repeat(32_001))).toThrow("size budget");
    expect(() => parsePackageAutomationDocument(manifest, JSON.stringify({ ...rule, ruleId: "other.app.rule" }))).toThrow("package-scoped");
  });
});
