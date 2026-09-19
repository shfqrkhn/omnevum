import type { AutomationProposal } from "./automation";
import type { VaultPackageAutomation } from "./model";
import { applyConfirmedProposal, type ProposalAuthorization, type ProposalCommandResult } from "./proposal-router";
import { PackageAutomationRegistry, type InstalledPackageAutomation, type PackageAutomationProposal } from "./package-automation-registry";
import type { PackageManifest } from "./package-contract";
import type { CommandBus } from "./commands";

/**
 * The shipped first-party package is intentionally declarative. It provides
 * the editor a stable owner and permission boundary while every user rule
 * still remains proposal-only until the normal command path confirms it.
 */
export const CORE_AUTOMATION_PACKAGE: PackageManifest = {
  packageId: "omnevum.automation",
  version: "1.0.0",
  displayName: "Omnevum declarative automation",
  trustClass: "FIRST_PARTY",
  frameworkApi: "omnevum-sdk-1",
  entrypoints: ["declarative"],
  ownedCanonicalTypes: [],
  commands: { consumes: ["record.update", "triage.defer", "triage.link", "triage.route", "triage.delete"], provides: [] },
  capabilities: { required: ["record"], optional: ["automation"] },
  permissions: ["automation.proposal"],
  externalEffects: [],
  dataSchema: "omnevum-automation-v1",
  migrations: [],
  lifecycle: { offline: "local", recovery: "disable", rollback: "previous", uninstall: "retain-export", retirement: "stop" },
  accessibility: "WCAG-2.2-AA",
  inputProfile: ["touch", "keyboard"],
  localization: ["en-CA", "fr-CA"]
};

export interface PackageAutomationStateStore {
  getAutomationRules(): Promise<VaultPackageAutomation[]>;
  setAutomationRules(rules: VaultPackageAutomation[]): Promise<void>;
}

export interface PackageAutomationRestoreResult {
  restored: number;
  skipped: number;
}

/**
 * Binds the in-memory proposal registry to the durable Vault-owned state
 * without moving command, permission, credential, or effect authority into
 * automation. Mutations roll back in-memory state if persistence fails.
 */
export class PackageAutomationRuntime {
  public constructor(private readonly registry: PackageAutomationRegistry, private readonly store: PackageAutomationStateStore) {}

  public async restore(): Promise<PackageAutomationRestoreResult> {
    return this.registry.restoreState(await this.store.getAutomationRules());
  }

  public async persist(): Promise<void> {
    await this.store.setAutomationRules(this.registry.exportState());
  }

  public async install(packageId: string, document: string): Promise<InstalledPackageAutomation> {
    return this.mutate(() => this.registry.install(packageId, document));
  }

  public async disable(ruleId: string, reason: string): Promise<InstalledPackageAutomation> {
    return this.mutate(() => this.registry.disable(ruleId, reason));
  }

  public async enable(ruleId: string): Promise<InstalledPackageAutomation> {
    return this.mutate(() => this.registry.enable(ruleId));
  }

  public async remove(ruleId: string): Promise<void> {
    return this.mutate(() => this.registry.remove(ruleId));
  }

  public list(packageId?: string): InstalledPackageAutomation[] {
    return this.registry.list(packageId);
  }

  public preview(trigger: string, context: Record<string, unknown>): PackageAutomationProposal[] {
    return this.registry.preview(trigger, context);
  }

  /**
   * Re-checks lifecycle ownership immediately before applying a proposal and
   * then delegates to the existing confirmation, scope, and CommandBus path.
   */
  public async apply(commands: CommandBus, proposal: PackageAutomationProposal, authorization: ProposalAuthorization): Promise<ProposalCommandResult> {
    if (!this.registry.ownsProposal(proposal)) throw new Error("Automation proposal is stale or no longer enabled");
    return applyConfirmedProposal(commands, proposal, authorization);
  }

  private async mutate<T>(operation: () => T): Promise<T> {
    const before = this.registry.exportState();
    try {
      const result = operation();
      await this.persist();
      return result;
    } catch (error) {
      this.registry.restoreState(before);
      throw error;
    }
  }
}

export type { AutomationProposal };
