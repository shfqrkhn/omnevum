import type { ViewDefinition } from "./compose";

export type PackageTrustClass = "FIRST_PARTY" | "FOSS_ADAPTED" | "DECLARATIVE" | "EXECUTABLE_UNQUALIFIED";
export type PackageStatus = "INSTALLED" | "DISABLED" | "RETIRED";

export interface PackageManifest {
  packageId: string;
  version: string;
  displayName: string;
  trustClass: PackageTrustClass;
  frameworkApi: string;
  entrypoints: string[];
  ownedCanonicalTypes: string[];
  commands: { consumes: string[]; provides: string[] };
  capabilities: { required: string[]; optional: string[] };
  permissions: string[];
  externalEffects: string[];
  dataSchema: string;
  migrations: string[];
  lifecycle: { offline: string; recovery: string; rollback: string; uninstall: string; retirement: string };
  accessibility: string;
  inputProfile: string[];
  localization: string[];
}

export interface InstalledPackage {
  manifest: PackageManifest;
  status: PackageStatus;
  installedAt: string;
  disabledReason?: string;
}

const MAX_PACKAGE_TEXT = 500;
const MAX_PACKAGE_LIST = 50;

export function assertPackageManifest(value: unknown): asserts value is PackageManifest {
  if (!isPackageManifest(value)) throw new Error("Invalid Omnevum package manifest");
}

export function isPackageManifest(value: unknown): value is PackageManifest {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const commands = candidate.commands;
  const capabilities = candidate.capabilities;
  const lifecycle = candidate.lifecycle;
  return typeof candidate.packageId === "string" && /^[a-z][a-z0-9._-]{1,80}$/.test(candidate.packageId) && typeof candidate.version === "string" && /^\d+\.\d+\.\d+$/.test(candidate.version) && typeof candidate.displayName === "string" && candidate.displayName.trim().length > 0 && candidate.displayName.length <= MAX_PACKAGE_TEXT && ["FIRST_PARTY", "FOSS_ADAPTED", "DECLARATIVE", "EXECUTABLE_UNQUALIFIED"].includes(String(candidate.trustClass)) && typeof candidate.frameworkApi === "string" && candidate.frameworkApi.length <= MAX_PACKAGE_TEXT && arrayOfStrings(candidate.entrypoints) && arrayOfStrings(candidate.ownedCanonicalTypes) && isCommandSet(commands) && isCapabilitySet(capabilities) && arrayOfStrings(candidate.permissions) && arrayOfStrings(candidate.externalEffects) && typeof candidate.dataSchema === "string" && candidate.dataSchema.length <= MAX_PACKAGE_TEXT && arrayOfStrings(candidate.migrations) && isLifecycle(lifecycle) && typeof candidate.accessibility === "string" && candidate.accessibility.length <= MAX_PACKAGE_TEXT && arrayOfStrings(candidate.inputProfile) && arrayOfStrings(candidate.localization);
}

export class PackageRegistry {
  private readonly packages = new Map<string, InstalledPackage>();

  public install(manifest: PackageManifest): InstalledPackage {
    assertPackageManifest(manifest);
    const current = this.packages.get(manifest.packageId);
    if (current && current.status !== "RETIRED") throw new Error(`Package ${manifest.packageId} is already installed`);
    if (manifest.trustClass === "EXECUTABLE_UNQUALIFIED") throw new Error("Executable third-party package isolation is not qualified");
    const otherPackages = [...this.packages.values()].filter((installed) => installed.manifest.packageId !== manifest.packageId && installed.status !== "RETIRED");
    const ownedTypes = new Set(otherPackages.flatMap((installed) => installed.manifest.ownedCanonicalTypes));
    if (manifest.ownedCanonicalTypes.some((type) => ownedTypes.has(type))) throw new Error("Canonical type ownership collision");
    const providedCommands = new Set(otherPackages.flatMap((installed) => installed.manifest.commands.provides));
    if (manifest.commands.provides.some((command) => providedCommands.has(command))) throw new Error("Provided command collision");
    const installed = { manifest: structuredClone(manifest), status: "INSTALLED" as const, installedAt: new Date().toISOString() };
    this.packages.set(manifest.packageId, installed);
    return structuredClone(installed);
  }

  public disable(packageId: string, reason: string): InstalledPackage {
    const installed = this.require(packageId);
    const next = { ...installed, status: "DISABLED" as const, disabledReason: reason.trim().slice(0, 500) || "disabled by policy" };
    this.packages.set(packageId, next);
    return structuredClone(next);
  }

  public retire(packageId: string): InstalledPackage {
    const installed = this.require(packageId);
    const next = { ...installed, status: "RETIRED" as const };
    this.packages.set(packageId, next);
    return structuredClone(next);
  }

  public get(packageId: string): InstalledPackage | undefined {
    const installed = this.packages.get(packageId);
    return installed ? structuredClone(installed) : undefined;
  }

  public list(): InstalledPackage[] {
    return [...this.packages.values()].map((installed) => structuredClone(installed)).sort((left, right) => left.manifest.packageId.localeCompare(right.manifest.packageId));
  }

  private require(packageId: string): InstalledPackage {
    const installed = this.packages.get(packageId);
    if (!installed) throw new Error(`Package ${packageId} is not installed`);
    return installed;
  }
}

export function generateBaselineView(manifest: PackageManifest, fields: string[]): ViewDefinition {
  assertPackageManifest(manifest);
  const safeFields = fields.filter((field) => /^[a-z][a-zA-Z0-9_.-]{0,119}$/.test(field)).slice(0, 50);
  return { schemaVersion: 1, id: `${manifest.packageId}.baseline`, title: manifest.displayName, widgets: [{ id: "capture", type: "form", title: manifest.displayName, fields: safeFields }, { id: "records", type: "list", title: "Records", fields: safeFields }], layout: "stack", source: "PACKAGE" };
}

function arrayOfStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= MAX_PACKAGE_LIST && value.every((item) => typeof item === "string" && item.length <= MAX_PACKAGE_TEXT);
}

function isCommandSet(value: unknown): value is { consumes: string[]; provides: string[] } {
  return typeof value === "object" && value !== null && arrayOfStrings((value as Record<string, unknown>).consumes) && arrayOfStrings((value as Record<string, unknown>).provides);
}

function isCapabilitySet(value: unknown): value is { required: string[]; optional: string[] } {
  return typeof value === "object" && value !== null && arrayOfStrings((value as Record<string, unknown>).required) && arrayOfStrings((value as Record<string, unknown>).optional);
}

function isLifecycle(value: unknown): value is PackageManifest["lifecycle"] {
  return typeof value === "object" && value !== null && ["offline", "recovery", "rollback", "uninstall", "retirement"].every((key) => typeof (value as Record<string, unknown>)[key] === "string" && ((value as Record<string, unknown>)[key] as string).length <= MAX_PACKAGE_TEXT);
}
