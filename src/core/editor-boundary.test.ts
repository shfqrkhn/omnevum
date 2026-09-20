import { describe, expect, it } from "vitest";
import { admitEditorAdapter, markEditorAssetsReady, openEditorSession, reportEditorRoundTrip, type EditorAdapterDescriptor } from "./editor-boundary";

const adapter: EditorAdapterDescriptor = {
  editorId: "candidate.office",
  version: "1.2.3",
  format: "RICH_DOCUMENT",
  qualification: "CANDIDATE",
  heavyAssets: true,
  supportsImport: true,
  supportsExport: true
};

function session() {
  return openEditorSession({
    sessionId: "editor-session-1",
    adapter,
    source: {
      artifactId: "artifact-1",
      fileName: "notes.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      sha256: "a".repeat(64),
      sizeBytes: 128
    }
  });
}

describe("replaceable editor boundary", () => {
  it("defers an unqualified heavy editor and keeps its assets lazy", () => {
    expect(admitEditorAdapter(adapter).status).toBe("DEFERRED");
    expect(session()).toMatchObject({ assetState: "LAZY", sourcePreserved: true, boundary: { canonicalOwner: "ARTIFACT", canonicalWrite: "NONE", storage: "HOST", permission: "HOST", ai: "HOST", sync: "HOST", network: "DISABLED" } });
    expect(markEditorAssetsReady(session()).assetState).toBe("READY");
  });

  it("requires explicit round-trip loss reporting and retains the original", () => {
    const result = reportEditorRoundTrip({ session: session(), exportedSha256: "b".repeat(64), lossless: false, lossReasons: ["unsupported embedded object"] });
    expect(result).toMatchObject({ sourceArtifactId: "artifact-1", originalRetained: true, derivedArtifact: true, canonicalWrite: "NONE", network: "DISABLED", lossReasons: ["unsupported embedded object"] });
    expect(() => reportEditorRoundTrip({ session: session(), exportedSha256: "b".repeat(64), lossless: false })).toThrow(/loss reasons/iu);
  });

  it("rejects a boundary that would grant the editor a host authority", () => {
    const unsafe = session();
    unsafe.boundary = { ...unsafe.boundary, canonicalWrite: "NONE", network: "DISABLED", storage: "EDITOR" as "HOST" };
    expect(() => reportEditorRoundTrip({ session: unsafe, exportedSha256: "b".repeat(64), lossless: true })).toThrow(/authority boundary/iu);
  });
});
