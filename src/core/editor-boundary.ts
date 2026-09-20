export const MAX_EDITOR_SOURCE_BYTES = 16 * 1024 * 1024;

export type EditorFormat = "RICH_DOCUMENT" | "SPREADSHEET" | "CANVAS";
export type EditorQualification = "QUALIFIED" | "CANDIDATE" | "UNQUALIFIED";

export interface EditorAdapterDescriptor {
  editorId: string;
  version: string;
  format: EditorFormat;
  qualification: EditorQualification;
  heavyAssets: boolean;
  supportsImport: boolean;
  supportsExport: boolean;
}

export interface EditorSource {
  artifactId: string;
  fileName: string;
  mimeType: string;
  sha256: string;
  sizeBytes: number;
}

export interface EditorAuthorityBoundary {
  canonicalOwner: "ARTIFACT";
  canonicalWrite: "NONE";
  storage: "HOST";
  permission: "HOST";
  ai: "HOST";
  sync: "HOST";
  network: "DISABLED";
}

export interface EditorSession {
  sessionId: string;
  source: EditorSource;
  adapter: EditorAdapterDescriptor;
  assetState: "LAZY" | "READY";
  sourcePreserved: true;
  boundary: EditorAuthorityBoundary;
}

export interface EditorRoundTripReport {
  sessionId: string;
  sourceArtifactId: string;
  sourceSha256: string;
  exportedSha256: string;
  lossless: boolean;
  lossReasons: string[];
  originalRetained: true;
  derivedArtifact: true;
  canonicalWrite: "NONE";
  network: "DISABLED";
}

export interface EditorAdmission {
  status: "ADMITTED" | "DEFERRED";
  reason: string;
}

export function admitEditorAdapter(adapter: EditorAdapterDescriptor): EditorAdmission {
  validateAdapter(adapter);
  if (adapter.qualification !== "QUALIFIED") return { status: "DEFERRED", reason: "The editor is not qualified for the current release profile." };
  if (!adapter.supportsImport || !adapter.supportsExport) return { status: "DEFERRED", reason: "Import and export round-trip support are both required." };
  return { status: "ADMITTED", reason: "The host owns storage, permissions, AI, sync, and canonical writes; the editor is replaceable presentation/workflow code." };
}

export function openEditorSession(input: { sessionId: string; source: EditorSource; adapter: EditorAdapterDescriptor }): EditorSession {
  assertIdentity(input.sessionId, "Editor session ID");
  validateSource(input.source);
  validateAdapter(input.adapter);
  return {
    sessionId: input.sessionId.trim(),
    source: { ...input.source, artifactId: input.source.artifactId.trim(), fileName: input.source.fileName.trim(), mimeType: input.source.mimeType.trim().toLowerCase(), sha256: input.source.sha256.trim().toLowerCase() },
    adapter: { ...input.adapter, editorId: input.adapter.editorId.trim(), version: input.adapter.version.trim() },
    assetState: input.adapter.heavyAssets ? "LAZY" : "READY",
    sourcePreserved: true,
    boundary: {
      canonicalOwner: "ARTIFACT",
      canonicalWrite: "NONE",
      storage: "HOST",
      permission: "HOST",
      ai: "HOST",
      sync: "HOST",
      network: "DISABLED"
    }
  };
}

export function markEditorAssetsReady(session: EditorSession): EditorSession {
  assertEditorSession(session);
  return { ...structuredClone(session), assetState: "READY" };
}

export function reportEditorRoundTrip(input: { session: EditorSession; exportedSha256: string; lossless: boolean; lossReasons?: string[] }): EditorRoundTripReport {
  assertEditorSession(input.session);
  const exportedSha256 = input.exportedSha256.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(exportedSha256)) throw new Error("Editor export digest is invalid");
  const lossReasons = [...new Set((input.lossReasons ?? []).map((reason) => reason.trim()).filter(Boolean))].slice(0, 32);
  if (input.lossless && lossReasons.length > 0) throw new Error("A lossless editor report cannot contain loss reasons");
  if (!input.lossless && lossReasons.length === 0) throw new Error("A lossy editor report must name its loss reasons");
  return {
    sessionId: input.session.sessionId,
    sourceArtifactId: input.session.source.artifactId,
    sourceSha256: input.session.source.sha256,
    exportedSha256,
    lossless: input.lossless,
    lossReasons,
    originalRetained: true,
    derivedArtifact: true,
    canonicalWrite: "NONE",
    network: "DISABLED"
  };
}

function validateSource(source: EditorSource): void {
  assertIdentity(source.artifactId, "Editor Artifact ID");
  if (!source.fileName.trim() || source.fileName.length > 240 || !source.mimeType.trim() || source.mimeType.length > 180) throw new Error("Editor source metadata is invalid");
  if (!Number.isSafeInteger(source.sizeBytes) || source.sizeBytes < 0 || source.sizeBytes > MAX_EDITOR_SOURCE_BYTES) throw new Error("Editor source exceeds the bounded 16 MiB limit");
  if (!/^[a-f0-9]{64}$/iu.test(source.sha256.trim())) throw new Error("Editor source digest is invalid");
}

function validateAdapter(adapter: EditorAdapterDescriptor): void {
  assertIdentity(adapter.editorId, "Editor identity");
  if (!/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/u.test(adapter.version.trim())) throw new Error("Editor version is invalid");
  if (!["RICH_DOCUMENT", "SPREADSHEET", "CANVAS"].includes(adapter.format)) throw new Error("Editor format is invalid");
  if (typeof adapter.heavyAssets !== "boolean" || typeof adapter.supportsImport !== "boolean" || typeof adapter.supportsExport !== "boolean") throw new Error("Editor capability flags are invalid");
}

function assertEditorSession(session: EditorSession): void {
  assertIdentity(session.sessionId, "Editor session ID");
  validateSource(session.source);
  validateAdapter(session.adapter);
  if (session.sourcePreserved !== true || session.boundary.canonicalOwner !== "ARTIFACT" || session.boundary.canonicalWrite !== "NONE" || session.boundary.storage !== "HOST" || session.boundary.permission !== "HOST" || session.boundary.ai !== "HOST" || session.boundary.sync !== "HOST" || session.boundary.network !== "DISABLED") throw new Error("Editor authority boundary is invalid");
}

function assertIdentity(value: string, label: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(value.trim())) throw new Error(`${label} is invalid`);
}
