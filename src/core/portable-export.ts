import type { CanonicalRecord, VaultArtifact, VaultDocument } from "./model";

export interface ArtifactOriginalEntry {
  recordId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dataBase64: string;
}

export interface ArtifactOriginalsExport {
  format: "OMNEVUM_ARTIFACT_ORIGINALS";
  version: 1;
  exportedAt: string;
  recordCount: number;
  artifactCount: number;
  artifacts: ArtifactOriginalEntry[];
}

export interface SerializedPortableExport {
  text: string;
  sizeBytes: number;
}

export function serializePortableJson(value: unknown): SerializedPortableExport {
  const text = JSON.stringify(value, null, 2);
  return { text, sizeBytes: new TextEncoder().encode(text).byteLength };
}

export function makeHumanReadableExport(vault: VaultDocument): SerializedPortableExport {
  const lines = [
    "# Omnevum human-readable export",
    "",
    `Exported at: ${vault.exportedAt}`,
    `Record count: ${vault.records.length}`,
    `History entries: ${vault.history?.length ?? 0}`,
    `Artifact payloads: ${vault.artifacts?.length ?? 0}`,
    `Package states: ${vault.packageStates?.length ?? 0}`,
    `Automation rules: ${vault.automationRules?.length ?? 0}`,
    "",
    "This is a human-readable projection. The full Vault JSON remains the lossless recovery export.",
    "",
    "## Records",
    ""
  ];
  for (const record of vault.records) {
    lines.push(
      `### ${inline(record.id)}`,
      `- Type: ${inline(record.recordType)}`,
      `- Owner: ${inline(record.owner)}`,
      `- Truth: ${inline(record.truthClass)}`,
      `- Sensitivity: ${inline(record.sensitivity)}`,
      `- Created: ${inline(record.createdAt)}`,
      `- Modified: ${inline(record.modifiedAt)}`,
      `- Revision: ${record.revision}`,
      `- Deleted: ${record.deleted ? "yes" : "no"}`,
      `- Data: ${inline(JSON.stringify(record.data))}`,
      ""
    );
  }
  return serializeText(lines.join("\n"));
}

export function makeArtifactOriginalsExport(vault: VaultDocument): SerializedPortableExport {
  const records = new Map(vault.records.map((record) => [record.id, record]));
  const artifacts = (vault.artifacts ?? []).map((artifact) => {
    const record = records.get(artifact.id);
    return {
      recordId: artifact.id,
      fileName: artifactFileName(record, artifact),
      mimeType: artifact.mimeType,
      sizeBytes: decodedBase64Bytes(artifact.dataBase64),
      dataBase64: artifact.dataBase64
    } satisfies ArtifactOriginalEntry;
  });
  return serializePortableJson({
    format: "OMNEVUM_ARTIFACT_ORIGINALS",
    version: 1,
    exportedAt: vault.exportedAt,
    recordCount: vault.records.length,
    artifactCount: artifacts.length,
    artifacts
  } satisfies ArtifactOriginalsExport);
}

export function parseArtifactOriginalsExport(text: string): ArtifactOriginalsExport {
  if (new TextEncoder().encode(text).byteLength > 64 * 1024 * 1024) throw new Error("Artifact originals export exceeds the bounded 64 MiB limit");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Artifact originals export is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Artifact originals export is invalid");
  const candidate = parsed as Partial<ArtifactOriginalsExport>;
  if (candidate.format !== "OMNEVUM_ARTIFACT_ORIGINALS" || candidate.version !== 1 || typeof candidate.exportedAt !== "string" || !Number.isSafeInteger(candidate.recordCount) || !Number.isSafeInteger(candidate.artifactCount) || !Array.isArray(candidate.artifacts)) {
    throw new Error("Artifact originals export is invalid");
  }
  if (candidate.artifactCount !== candidate.artifacts.length || candidate.artifacts.some((entry) => !isArtifactOriginalEntry(entry))) throw new Error("Artifact originals export contains invalid entries");
  return candidate as ArtifactOriginalsExport;
}

export function verifyHumanReadableExport(text: string, expectedRecordCount?: number): void {
  if (!text.startsWith("# Omnevum human-readable export\n")) throw new Error("Human-readable export header is invalid");
  const count = /^Record count: (\d+)$/mu.exec(text)?.[1];
  if (count === undefined || (expectedRecordCount !== undefined && Number(count) !== expectedRecordCount)) throw new Error("Human-readable export record count is invalid");
}

function serializeText(text: string): SerializedPortableExport {
  return { text, sizeBytes: new TextEncoder().encode(text).byteLength };
}

function inline(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("`", "'").replace(/[\r\n]+/gu, " ");
}

function artifactFileName(record: CanonicalRecord | undefined, artifact: VaultArtifact): string {
  const data = record?.data;
  const candidate = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>).fileName : undefined;
  return typeof candidate === "string" && candidate.trim().length > 0 ? candidate : `${artifact.id}.bin`;
}

function decodedBase64Bytes(value: string): number {
  return Math.floor(value.length * 3 / 4) - (value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0);
}

function isArtifactOriginalEntry(value: unknown): value is ArtifactOriginalEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<ArtifactOriginalEntry>;
  const sizeBytes = candidate.sizeBytes;
  const dataBase64 = candidate.dataBase64;
  if (typeof candidate.recordId !== "string" || typeof candidate.fileName !== "string" || typeof candidate.mimeType !== "string" || typeof sizeBytes !== "number" || !Number.isSafeInteger(sizeBytes) || sizeBytes < 0 || typeof dataBase64 !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/u.test(dataBase64)) return false;
  return decodedBase64Bytes(dataBase64) === sizeBytes;
}
