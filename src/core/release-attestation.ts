export interface ReleaseAttestation {
  format: "OMNEVUM_RELEASE_ATTESTATION";
  version: 1;
  algorithm: "ECDSA-P256-SHA256";
  keyId: string;
  sourceRevision: string;
  artifactDigest: string;
  publicKeyJwk: JsonWebKey;
  signatureBase64: string;
  verificationMaterialRetained: true;
  safetyAssurance: false;
}

export interface ReleaseAttestationVerification {
  kind: "RELEASE_ATTESTATION_VERIFICATION";
  status: "VERIFIED" | "REJECTED";
  artifactDigest: string;
  identityVerified: boolean;
  integrityVerified: boolean;
  safetyAssurance: false;
  reason: string;
}

export function attestationPayload(attestation: Pick<ReleaseAttestation, "artifactDigest" | "sourceRevision" | "keyId">): string {
  return ["OMNEVUM_RELEASE_ATTESTATION", `artifactDigest=${attestation.artifactDigest}`, `sourceRevision=${attestation.sourceRevision}`, `keyId=${attestation.keyId}`].join("\n");
}

export async function verifyReleaseAttestation(attestation: ReleaseAttestation, expectedArtifactDigest: string): Promise<ReleaseAttestationVerification> {
  if (!isAttestationShape(attestation) || !/^[a-f0-9]{64}$/u.test(expectedArtifactDigest) || attestation.artifactDigest !== expectedArtifactDigest) return rejected(expectedArtifactDigest, "Attestation identity or exact artifact digest does not match");
  try {
    const publicKey = await crypto.subtle.importKey("jwk", attestation.publicKeyJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const signature = base64ToBytes(attestation.signatureBase64);
    const verified = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, signature.slice().buffer as ArrayBuffer, new TextEncoder().encode(attestationPayload(attestation)));
    return verified ? { kind: "RELEASE_ATTESTATION_VERIFICATION", status: "VERIFIED", artifactDigest: expectedArtifactDigest, identityVerified: true, integrityVerified: true, safetyAssurance: false, reason: "Signature verifies the exact artifact digest, source revision, and retained key identity" } : rejected(expectedArtifactDigest, "Signature verification failed");
  } catch {
    return rejected(expectedArtifactDigest, "Attestation verification material or signature is invalid");
  }
}

function isAttestationShape(value: unknown): value is ReleaseAttestation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<ReleaseAttestation>;
  return candidate.format === "OMNEVUM_RELEASE_ATTESTATION" && candidate.version === 1 && candidate.algorithm === "ECDSA-P256-SHA256" && typeof candidate.keyId === "string" && /^[a-z][a-z0-9._-]{1,120}$/u.test(candidate.keyId) && typeof candidate.sourceRevision === "string" && /^[0-9a-f]{7,64}$/u.test(candidate.sourceRevision) && typeof candidate.artifactDigest === "string" && /^[a-f0-9]{64}$/u.test(candidate.artifactDigest) && typeof candidate.publicKeyJwk === "object" && candidate.publicKeyJwk !== null && typeof candidate.signatureBase64 === "string" && candidate.signatureBase64.length > 0 && candidate.signatureBase64.length < 2_000 && candidate.verificationMaterialRetained === true && candidate.safetyAssurance === false;
}

function rejected(artifactDigest: string, reason: string): ReleaseAttestationVerification {
  return { kind: "RELEASE_ATTESTATION_VERIFICATION", status: "REJECTED", artifactDigest, identityVerified: false, integrityVerified: false, safetyAssurance: false, reason };
}

function base64ToBytes(value: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) throw new Error("Invalid attestation signature encoding");
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}
