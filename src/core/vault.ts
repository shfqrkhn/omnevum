import type { VaultDocument } from "./model";
import { assertVaultDocument } from "./validation";

export function parseVault(text: string): VaultDocument {
  const parsed: unknown = JSON.parse(text);
  assertVaultDocument(parsed);
  return parsed;
}

