import { describe, expect, it } from "vitest";
import { attestationPayload, verifyReleaseAttestation, type ReleaseAttestation } from "./release-attestation";

async function signedAttestation(digest = "a".repeat(64)): Promise<ReleaseAttestation> {
  const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  if (!("privateKey" in keys) || !("publicKey" in keys)) throw new Error("Signing fixture did not produce a key pair");
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
  const base = { format: "OMNEVUM_RELEASE_ATTESTATION" as const, version: 1 as const, algorithm: "ECDSA-P256-SHA256" as const, keyId: "release-key-1", sourceRevision: "abc1234", artifactDigest: digest, publicKeyJwk, verificationMaterialRetained: true as const, safetyAssurance: false as const };
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, new TextEncoder().encode(attestationPayload(base)));
  let binary = "";
  for (const byte of new Uint8Array(signature)) binary += String.fromCharCode(byte);
  return { ...base, signatureBase64: btoa(binary) };
}

describe("release attestation verification", () => {
  it("verifies an exact artifact digest with retained public material", async () => {
    const attestation = await signedAttestation();
    await expect(verifyReleaseAttestation(attestation, "a".repeat(64))).resolves.toMatchObject({ status: "VERIFIED", identityVerified: true, integrityVerified: true, safetyAssurance: false });
  });

  it("rejects a digest mismatch before signature acceptance", async () => {
    const attestation = await signedAttestation();
    await expect(verifyReleaseAttestation(attestation, "b".repeat(64))).resolves.toMatchObject({ status: "REJECTED", identityVerified: false, integrityVerified: false });
  });

  it("rejects a tampered signature and never labels provenance as safety", async () => {
    const attestation = await signedAttestation();
    const tampered = { ...attestation, signatureBase64: `${attestation.signatureBase64.slice(0, -2)}AA` };
    await expect(verifyReleaseAttestation(tampered, attestation.artifactDigest)).resolves.toMatchObject({ status: "REJECTED", safetyAssurance: false });
  });
});
