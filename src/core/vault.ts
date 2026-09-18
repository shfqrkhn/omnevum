import type { VaultDocument } from "./model";
import { assertVaultDocument } from "./validation";

export const MAX_VAULT_JSON_BYTES = 64 * 1024 * 1024;

export function parseVault(text: string): VaultDocument {
  if (new TextEncoder().encode(text).byteLength > MAX_VAULT_JSON_BYTES) throw new Error("Vault JSON exceeds the bounded 64 MiB import limit");
  const parsed: unknown = JSON.parse(text);
  assertVaultDocument(parsed);
  return parsed;
}

export async function withVaultIntegrity(vault: VaultDocument): Promise<VaultDocument> {
  const { integrity: _integrity, ...payload } = vault;
  const digest = await digestText(stableJson(payload));
  return { ...vault, integrity: { algorithm: "SHA-256", digest } };
}

export async function verifyVaultIntegrity(vault: VaultDocument): Promise<void> {
  if (!vault.integrity) return;
  const { integrity: _integrity, ...payload } = vault;
  const digest = await digestText(stableJson(payload));
  if (digest.toLowerCase() !== vault.integrity.digest.toLowerCase()) throw new Error("Vault integrity check failed; no data was written");
}

async function digestText(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;
  return JSON.stringify(value);
}
