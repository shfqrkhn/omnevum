import type { VaultDocument } from "./model";
import { withVaultIntegrity, verifyVaultIntegrity } from "./vault";
import { assertVaultDocument } from "./validation";

export const ENCRYPTED_VAULT_VERSION = 1 as const;
const MAX_ENCRYPTED_FIELD_LENGTH = 64 * 1024 * 1024;
const PBKDF2_ITERATIONS = 310_000;

export interface EncryptedVaultEnvelope {
  format: "OMNEVUM_ENCRYPTED_VAULT";
  version: typeof ENCRYPTED_VAULT_VERSION;
  kdf: "PBKDF2-SHA-256";
  iterations: number;
  saltBase64: string;
  ivBase64: string;
  ciphertextBase64: string;
}

export function isEncryptedVaultEnvelope(value: unknown): value is EncryptedVaultEnvelope {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.format === "OMNEVUM_ENCRYPTED_VAULT" && candidate.version === ENCRYPTED_VAULT_VERSION && candidate.kdf === "PBKDF2-SHA-256" && typeof candidate.iterations === "number" && Number.isInteger(candidate.iterations) && candidate.iterations >= 100_000 && typeof candidate.saltBase64 === "string" && candidate.saltBase64.length <= 256 && typeof candidate.ivBase64 === "string" && candidate.ivBase64.length <= 256 && typeof candidate.ciphertextBase64 === "string" && candidate.ciphertextBase64.length <= MAX_ENCRYPTED_FIELD_LENGTH;
}

export async function encryptVault(vault: VaultDocument, password: string): Promise<EncryptedVaultEnvelope> {
  assertPassword(password);
  const protectedVault = await withVaultIntegrity(vault);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: asArrayBuffer(iv) }, key, new TextEncoder().encode(JSON.stringify(protectedVault)));
  return { format: "OMNEVUM_ENCRYPTED_VAULT", version: ENCRYPTED_VAULT_VERSION, kdf: "PBKDF2-SHA-256", iterations: PBKDF2_ITERATIONS, saltBase64: bytesToBase64(salt), ivBase64: bytesToBase64(iv), ciphertextBase64: bytesToBase64(new Uint8Array(ciphertext)) };
}

export async function decryptVault(envelope: EncryptedVaultEnvelope, password: string): Promise<VaultDocument> {
  assertPassword(password);
  if (!isEncryptedVaultEnvelope(envelope)) throw new Error("Invalid encrypted Vault envelope");
  try {
    const key = await deriveKey(password, base64ToBytes(envelope.saltBase64), envelope.iterations);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: asArrayBuffer(base64ToBytes(envelope.ivBase64)) }, key, asArrayBuffer(base64ToBytes(envelope.ciphertextBase64)));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(plaintext));
    assertVaultDocument(parsed);
    await verifyVaultIntegrity(parsed);
    return parsed;
  } catch {
    throw new Error("Encrypted Vault decryption or integrity verification failed");
  }
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: asArrayBuffer(salt), iterations, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

function assertPassword(password: string): void {
  if (password.length < 8) throw new Error("Vault password must contain at least 8 characters");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error("Invalid Base64 payload");
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
