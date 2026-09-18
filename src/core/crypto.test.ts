import { describe, expect, it } from "vitest";
import { decryptVault, encryptVault } from "./crypto";
import type { VaultDocument } from "./model";

const vault: VaultDocument = { format: "OMNEVUM_VAULT", version: 1, exportedAt: new Date().toISOString(), records: [] };

describe("optional encrypted Vault", () => {
  it("round-trips without persisting the password", async () => {
    const encrypted = await encryptVault(vault, "correct horse battery");
    expect(JSON.stringify(encrypted)).not.toContain("correct horse battery");
    const restored = await decryptVault(encrypted, "correct horse battery");
    expect(restored).toMatchObject(vault);
    expect(restored.integrity).toMatchObject({ algorithm: "SHA-256" });
  });

  it("fails closed for a wrong password or short password", async () => {
    await expect(encryptVault(vault, "short")).rejects.toThrow("at least 8");
    const encrypted = await encryptVault(vault, "correct horse battery");
    await expect(decryptVault(encrypted, "wrong password")).rejects.toThrow("decryption");
  });
});
