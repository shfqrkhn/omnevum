import { describe, expect, it } from "vitest";
import { generateBaselineView, PackageRegistry, type PackageManifest } from "./package-contract";

const manifest: PackageManifest = { packageId: "sample.app", version: "1.0.0", displayName: "Sample", trustClass: "DECLARATIVE", frameworkApi: "omnevum-sdk-1", entrypoints: ["declarative"], ownedCanonicalTypes: ["note"], commands: { consumes: ["record.create"], provides: [] }, capabilities: { required: ["record"], optional: ["search"] }, permissions: [], externalEffects: [], dataSchema: "schema-1", migrations: [], lifecycle: { offline: "local", recovery: "disable", rollback: "previous", uninstall: "retain-export", retirement: "stop" }, accessibility: "WCAG-2.2-AA", inputProfile: ["touch", "keyboard"], localization: ["en-CA", "fr-CA"] };

describe("package factory contract", () => {
  it("installs declarative packages and generates a baseline view", () => {
    const registry = new PackageRegistry();
    const installed = registry.install(manifest);
    expect(installed.status).toBe("INSTALLED");
    expect(generateBaselineView(manifest, ["text", "bad field"])).toMatchObject({ id: "sample.app.baseline", source: "PACKAGE", widgets: [{ type: "form" }, { type: "list" }] });
  });

  it("rejects unqualified executable extensions and supports retirement", () => {
    const registry = new PackageRegistry();
    expect(() => registry.install({ ...manifest, packageId: "unsafe.app", trustClass: "EXECUTABLE_UNQUALIFIED" })).toThrow("not qualified");
    registry.install(manifest);
    expect(registry.disable(manifest.packageId, "test").status).toBe("DISABLED");
    expect(registry.retire(manifest.packageId).status).toBe("RETIRED");
  });

  it("rejects two installed packages from claiming one canonical type", () => {
    const registry = new PackageRegistry();
    registry.install(manifest);
    expect(() => registry.install({ ...manifest, packageId: "other.app" })).toThrow("ownership collision");
  });
});
