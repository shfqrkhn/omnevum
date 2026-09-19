import type { AutomationProposal } from "./automation";
import type { VaultPackageAutomation } from "./model";
import { PackageAutomationRegistry, type InstalledPackageAutomation, type PackageAutomationProposal } from "./package-automation-registry";

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

  public list(packageId?: string): InstalledPackageAutomation[] {
    return this.registry.list(packageId);
  }

  public preview(trigger: string, context: Record<string, unknown>): PackageAutomationProposal[] {
    return this.registry.preview(trigger, context);
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
