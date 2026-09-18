export interface ExtensionManifest {
  extensionId: string;
  version: string;
  kind: "DECLARATIVE" | "EXECUTABLE";
  capabilities: string[];
  source: "FIRST_PARTY" | "OWNER_CONTROLLED" | "COMMUNITY";
}

export interface ExtensionAdmission {
  status: "ADMITTED_DECLARATIVE" | "DISABLED_UNQUALIFIED";
  reason: string;
}

export function admitExtension(manifest: ExtensionManifest): ExtensionAdmission {
  if (!/^[a-z][a-z0-9._-]{1,80}$/.test(manifest.extensionId) || !/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error("Invalid extension identity");
  if (!Array.isArray(manifest.capabilities) || manifest.capabilities.some((capability) => !/^[a-z][a-z0-9._-]{0,80}$/.test(capability))) throw new Error("Invalid extension capability declaration");
  if (manifest.kind === "EXECUTABLE") return { status: "DISABLED_UNQUALIFIED", reason: "No executable third-party isolation model is qualified for the static baseline" };
  return { status: "ADMITTED_DECLARATIVE", reason: "Declarative extensions are data-only and still use platform contracts" };
}
