import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const entries = readdirSync(root, { withFileTypes: true });
const documentationRoots = entries.filter((entry) => entry.isDirectory() && ["docs", ".docs"].includes(entry.name)).map((entry) => entry.name);
const allowedRootFiles = new Set([".git", ".gitattributes", ".gitignore", "AGENTS.md", "README.md", "index.html", "package-lock.json", "package.json", "tsconfig.json", "vite.config.ts"]);
const allowedRootDirectories = new Set([".git", ".github", "docs", "dist", "node_modules", "public", "scripts", "src", "coverage", ".vite"]);
const allowedDocsFiles = new Set(["README.md", "Omni_3.32.0.md", "Omnevum-MPES-v0_17_4.md"]);
const allowedDocsDirectories = new Set(["control", "evidence"]);
const required = [
  "AGENTS.md",
  "README.md",
  "package.json",
  "index.html",
  "src/main.ts",
  "src/core/model.ts",
  "docs/Omni_3.32.0.md",
  "docs/Omnevum-MPES-v0_17_4.md",
  "docs/control/control-manifest.json",
  "docs/control/requirements.json",
  "docs/control/acceptance-scenarios.json",
  "docs/control/acceptance-results.json",
  "docs/control/dependency-sbom.json",
  "docs/control/foss-compliance.json",
  "docs/control/phase0-acceptance.json",
  "docs/control/mvp-acceptance.json",
  "docs/control/support-matrix.json",
  "docs/control/owner-registry.json",
  "docs/control/capability-catalogue.json",
  "docs/control/effect-outbox-policy.json",
  "docs/control/credential-key-policy.json",
  "docs/control/capability-coverage.json",
  "docs/control/upstream.json",
  "docs/control/patch-fork-delta.json",
  "docs/control/license-provenance.json",
  "docs/control/currentness-radar.json",
  "docs/control/compatibility-matrix.json",
  "docs/control/risk-threat-register.json",
  "docs/control/migration-register.json",
  "docs/control/release-evidence.json",
  "docs/control/recovery-bundle.json",
  "docs/control/engineering-controller.json",
  "docs/control/completion-ledger.json"
];

const failures = [];
if (documentationRoots.length !== 1 || documentationRoots[0] !== "docs") failures.push(`documentation roots=${documentationRoots.join(",") || "none"}`);
for (const entry of entries) {
  if (entry.isFile() && !allowedRootFiles.has(entry.name)) failures.push(`forbidden root file ${entry.name}`);
  if (entry.isDirectory() && !allowedRootDirectories.has(entry.name)) failures.push(`forbidden root directory ${entry.name}`);
}
for (const path of required) if (!existsSync(join(root, path))) failures.push(`missing ${path}`);

for (const path of ["docs/control/control-manifest.json", "docs/control/requirements.json", "docs/control/acceptance-scenarios.json", "docs/control/acceptance-results.json", "docs/control/dependency-sbom.json", "docs/control/foss-compliance.json", "docs/control/recovery-bundle.json"]) {
  if (!existsSync(join(root, path))) continue;
  const value = JSON.parse(readFileSync(join(root, path), "utf8"));
  if (value.generatedBy !== "scripts/generate-control.mjs") failures.push(`unidentified generated file ${path}`);
}

const manifestPath = join(root, "docs/control/control-manifest.json");
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const listed = new Set([...(manifest.generatedFiles ?? []), ...(manifest.maintainedRegisters ?? [])]);
  for (const entry of readdirSync(join(root, "docs/control"))) {
    if (entry.endsWith(".json") && !listed.has(entry)) failures.push(`unindexed control file docs/control/${entry}`);
  }
  for (const generated of manifest.generatedFiles ?? []) {
    if (typeof generated !== "string" || !existsSync(join(root, "docs/control", generated))) failures.push(`missing generated control file ${generated}`);
  }
  const canonicalDatasets = Array.isArray(manifest.canonicalDatasets) ? manifest.canonicalDatasets : [];
  const canonicalIds = new Set();
  const canonicalPaths = new Set();
  for (const dataset of canonicalDatasets) {
    if (typeof dataset?.id !== "string" || typeof dataset?.path !== "string") {
      failures.push("invalid canonical dataset declaration");
      continue;
    }
    if (canonicalIds.has(dataset.id)) failures.push(`duplicate canonical dataset id ${dataset.id}`);
    if (canonicalPaths.has(dataset.path)) failures.push(`duplicate canonical dataset path ${dataset.path}`);
    canonicalIds.add(dataset.id);
    canonicalPaths.add(dataset.path);
    if (!existsSync(join(root, dataset.path))) failures.push(`missing canonical dataset ${dataset.path}`);
  }
  for (const relocation of manifest.relocations ?? []) {
    if (typeof relocation?.from !== "string" || typeof relocation?.to !== "string" || !existsSync(join(root, relocation.to))) failures.push(`broken relocation ${JSON.stringify(relocation)}`);
  }
  for (const retiredPath of manifest.retiredPaths ?? []) {
    if (typeof retiredPath !== "string") failures.push("invalid retired path declaration");
    else if (existsSync(join(root, retiredPath))) failures.push(`retired path still exists ${retiredPath}`);
  }
  for (const [key, item] of Object.entries(manifest.source ?? {})) {
    if (typeof item !== "object" || item === null || typeof item.path !== "string" || typeof item.sha256 !== "string") {
      failures.push(`invalid source receipt ${key}`);
      continue;
    }
    const sourcePath = join(root, item.path);
    if (!existsSync(sourcePath)) failures.push(`missing source receipt target ${item.path}`);
    else {
      const actual = createHash("sha256").update(readFileSync(sourcePath)).digest("hex");
      if (actual !== item.sha256) failures.push(`stale source hash ${item.path}`);
    }
  }
}

const docsEntries = readdirSync(join(root, "docs"), { withFileTypes: true });
for (const entry of docsEntries) {
  if (entry.isFile() && !allowedDocsFiles.has(entry.name)) failures.push(`unindexed docs root file docs/${entry.name}`);
  if (entry.isDirectory() && !allowedDocsDirectories.has(entry.name)) failures.push(`unindexed docs root directory docs/${entry.name}`);
}
const walk = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? walk(path) : [path];
});
const controlText = walk(join(root, "docs/control")).filter((path) => path.endsWith(".json")).map((path) => readFileSync(path, "utf8")).join("\n");
for (const path of walk(join(root, "docs/evidence"))) {
  const relativePath = relative(root, path).replaceAll("\\", "/");
  if (!controlText.includes(relativePath)) failures.push(`unindexed evidence ${relativePath}`);
}
if (docsEntries.some((entry) => entry.isFile() && entry.name.toLowerCase() === "current_state.md")) {
  failures.push("state-bound current_state.md must be generated by a verified receipt path");
}

if (failures.length > 0) {
  console.error(`STRUCTURE_AUDIT_FAIL\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log("STRUCTURE_AUDIT_PASS");
}
