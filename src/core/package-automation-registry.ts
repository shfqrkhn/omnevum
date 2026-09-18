import type { AutomationProposal } from "./automation";
import { parsePackageAutomationDocument, type PackageAutomationAdapter } from "./package-automation";
import { PackageRegistry } from "./package-contract";

export type PackageAutomationStatus = "ENABLED" | "DISABLED";

export interface InstalledPackageAutomation {
  packageId: string;
  ruleId: string;
  ruleVersion: number;
  trigger: string;
  status: PackageAutomationStatus;
  installedAt: string;
  disabledReason?: string;
}

export interface PackageAutomationProposal extends AutomationProposal {
  packageId: string;
}

const MAX_AUTOMATIONS_PER_PACKAGE = 50;

interface RegisteredAutomation {
  adapter: PackageAutomationAdapter;
  status: PackageAutomationStatus;
  installedAt: string;
  disabledReason?: string;
}

/**
 * Owns bounded rule lifecycle metadata while leaving execution to the normal
 * command, permission, and confirmation path. Package disable/retirement is
 * checked at preview time so stale proposals cannot survive package lifecycle
 * changes.
 */
export class PackageAutomationRegistry {
  private readonly automations = new Map<string, RegisteredAutomation>();

  public constructor(private readonly packages: PackageRegistry) {}

  public install(packageId: string, document: string): InstalledPackageAutomation {
    const installed = this.packages.get(packageId);
    if (!installed || installed.status !== "INSTALLED") throw new Error("Package must be installed and enabled before automation registration");
    const packageCount = [...this.automations.values()].filter((entry) => entry.adapter.packageId === packageId).length;
    if (packageCount >= MAX_AUTOMATIONS_PER_PACKAGE) throw new Error("Package automation limit exceeded");
    const adapter = parsePackageAutomationDocument(installed.manifest, document);
    if (this.automations.has(adapter.rule.ruleId)) throw new Error("Automation rule is already registered");
    const entry: RegisteredAutomation = { adapter, status: "ENABLED", installedAt: new Date().toISOString() };
    this.automations.set(adapter.rule.ruleId, entry);
    return this.describe(adapter.rule.ruleId, entry);
  }

  public get(ruleId: string): InstalledPackageAutomation | undefined {
    const entry = this.automations.get(ruleId);
    return entry ? this.describe(ruleId, entry) : undefined;
  }

  public list(packageId?: string): InstalledPackageAutomation[] {
    return [...this.automations.entries()]
      .filter(([, entry]) => packageId === undefined || entry.adapter.packageId === packageId)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([ruleId, entry]) => this.describe(ruleId, entry));
  }

  public disable(ruleId: string, reason: string): InstalledPackageAutomation {
    const entry = this.require(ruleId);
    entry.status = "DISABLED";
    entry.disabledReason = reason.trim().slice(0, 500) || "disabled by policy";
    return this.describe(ruleId, entry);
  }

  public enable(ruleId: string): InstalledPackageAutomation {
    const entry = this.require(ruleId);
    const installed = this.packages.get(entry.adapter.packageId);
    if (!installed || installed.status !== "INSTALLED") throw new Error("Package is not installed and enabled");
    entry.status = "ENABLED";
    delete entry.disabledReason;
    return this.describe(ruleId, entry);
  }

  public preview(trigger: string, context: Record<string, unknown>): PackageAutomationProposal[] {
    return [...this.automations.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([, entry]) => {
        const installed = this.packages.get(entry.adapter.packageId);
        if (entry.status !== "ENABLED" || !installed || installed.status !== "INSTALLED" || entry.adapter.rule.trigger !== trigger) return [];
        return entry.adapter.preview(context).map((proposal) => ({ ...proposal, packageId: entry.adapter.packageId }));
      })
      .map((proposal) => ({ ...proposal, arguments: structuredClone(proposal.arguments) }));
  }

  private require(ruleId: string): RegisteredAutomation {
    const entry = this.automations.get(ruleId);
    if (!entry) throw new Error("Automation rule is not registered");
    return entry;
  }

  private describe(ruleId: string, entry: RegisteredAutomation): InstalledPackageAutomation {
    return {
      packageId: entry.adapter.packageId,
      ruleId,
      ruleVersion: entry.adapter.rule.version,
      trigger: entry.adapter.rule.trigger,
      status: entry.status,
      installedAt: entry.installedAt,
      ...(entry.disabledReason ? { disabledReason: entry.disabledReason } : {})
    };
  }
}
