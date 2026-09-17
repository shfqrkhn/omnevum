export const MAX_PORTABLE_ARTIFACT_BYTES = 10 * 1024 * 1024;

export interface ArtifactInput {
  fileName: string;
  mimeType: string;
  blob: Blob;
  space?: "personal" | "household" | "work";
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
