import type { CanonicalRecord, VaultDocument } from "./model";
import { CURRENT_SCHEMA_VERSION, VAULT_FORMAT_VERSION } from "./model";
import { assertCanonicalRecord, assertVaultDocument } from "./validation";

export interface MigrationReceipt {
  fromVersion: number;
  toVersion: number;
  changed: boolean;
  steps: string[];
}

export function migrateRecord(value: unknown, targetVersion: number = CURRENT_SCHEMA_VERSION): { record: CanonicalRecord; receipt: MigrationReceipt } {
  assertCanonicalRecord(value);
  if (targetVersion !== CURRENT_SCHEMA_VERSION || value.schemaVersion > targetVersion) throw new Error("Canonical record schema requires a newer supported runtime");
  return { record: structuredClone(value), receipt: { fromVersion: value.schemaVersion, toVersion: targetVersion, changed: false, steps: [] } };
}

export function migrateVault(value: unknown, targetVersion: number = CURRENT_SCHEMA_VERSION): { vault: VaultDocument; receipt: MigrationReceipt } {
  assertVaultDocument(value);
  if (targetVersion !== CURRENT_SCHEMA_VERSION || value.records.some((record) => record.schemaVersion > targetVersion)) throw new Error("Vault contains a newer unsupported schema");
  return { vault: structuredClone(value), receipt: { fromVersion: CURRENT_SCHEMA_VERSION, toVersion: targetVersion, changed: false, steps: [] } };
}

export function assertCurrentVersions(value: unknown): void {
  if (typeof value === "object" && value !== null && "version" in value && (value as { version?: unknown }).version !== VAULT_FORMAT_VERSION) throw new Error("Unsupported version");
}
