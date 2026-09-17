import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const docsRoot = join(root, "docs");
const controlRoot = join(docsRoot, "control");
const mpesPath = join(docsRoot, "Omnevum-MPES-v0.12.0-converged.md");
const omniPath = join(docsRoot, "Omni_3.32.0.md");
const packagePath = join(root, "package.json");
const lockPath = join(root, "package-lock.json");
mkdirSync(controlRoot, { recursive: true });

const mpes = readFileSync(mpesPath, "utf8");
const omni = readFileSync(omniPath, "utf8");
const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
const lock = JSON.parse(readFileSync(lockPath, "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const source = {
  mpes: { path: relative(root, mpesPath).replaceAll("\\", "/"), sha256: sha256(mpes) },
  omni: { path: relative(root, omniPath).replaceAll("\\", "/"), sha256: sha256(omni) },
  package: { path: relative(root, packagePath).replaceAll("\\", "/"), sha256: sha256(readFileSync(packagePath)) },
  lockfile: { path: relative(root, lockPath).replaceAll("\\", "/"), sha256: sha256(readFileSync(lockPath)) }
};

const requirements = [];
const normativePattern = /\b(?:SHALL NOT|MUST NOT|SHALL|MUST)\b/gi;
const extractRequirements = (document, text, path, generatedPrefix) => {
  let generatedId = 1;
  let heading = "";
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (/^#{1,6}\s+/.test(line)) heading = line.replace(/^#{1,6}\s+/, "").trim();
    const normativeKeywords = [...line.matchAll(normativePattern)].map((match) => match[0].toUpperCase());
    if (normativeKeywords.length === 0) continue;
    const id = line.match(/\bOMN-[A-Z0-9]+-\d{3}\b/)?.[0] ?? `OMN-AUTO-${generatedPrefix}-${String(generatedId++).padStart(4, "0")}`;
    requirements.push({
      id,
      kind: id.startsWith("OMN-AUTO-") ? "GENERATED" : "TAGGED",
      document,
      source: { path, line: index + 1, heading },
      normativeKeywords: [...new Set(normativeKeywords)],
      text: line.trim()
    });
  }
};
extractRequirements("MPES", mpes, source.mpes.path, "MPES");
extractRequirements("Omni", omni, source.omni.path, "OMNI");
const requirementIds = new Set();
for (const requirement of requirements) {
  if (requirementIds.has(requirement.id)) throw new Error(`duplicate requirement id ${requirement.id}`);
  requirementIds.add(requirement.id);
}

const acceptance = [];
for (const [index, line] of mpes.split(/\r?\n/).entries()) {
  const match = line.match(/^(OMN-ACC-\d{3}):\s*(.*)$/);
  if (match) acceptance.push({ id: match[1], source: { path: source.mpes.path, line: index + 1 }, text: match[2] });
}

const writeJson = (name, value) => writeFileSync(join(controlRoot, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
const generatedBy = "scripts/generate-control.mjs";
writeJson("requirements.json", {
  schemaVersion: 1,
  kind: "requirement-register",
  generatedBy,
  authority: "projection of the controlling MPES; not a replacement",
  source,
  items: requirements
});
writeJson("acceptance-scenarios.json", {
  schemaVersion: 1,
  kind: "acceptance-scenario-register",
  generatedBy,
  authority: "projection of the controlling MPES; statuses live in acceptance profiles",
  source,
  items: acceptance
});

const lockedPackages = Object.entries(lock.packages ?? {})
  .filter(([path]) => path.startsWith("node_modules/"))
  .map(([path, value]) => ({
    name: path.slice("node_modules/".length),
    version: value.version ?? "UNKNOWN",
    resolved: value.resolved ?? null,
    integrity: value.integrity ?? null,
    dev: value.dev === true,
    license: value.license ?? "UNVERIFIED_NPM_METADATA",
    licenseSource: value.license ? "package-lock metadata" : "missing"
  }))
  .sort((left, right) => left.name.localeCompare(right.name));
writeJson("dependency-sbom.json", {
  schemaVersion: 1,
  kind: "dependency-sbom",
  generatedBy,
  authority: "derived inventory; license and security scanners remain required",
  package: { name: packageJson.name, version: packageJson.version },
  source,
  format: "SPDX-compatible inventory projection",
  packages: lockedPackages,
  policy: [
    "Lockfile identity is not proof of license, security, availability, or release acceptance.",
    "Registry or source disappearance must not be silently substituted while claiming exact reconstruction.",
    "A release must run current qualified vulnerability, license, provenance, and SBOM checks."
  ]
});

const generatedFiles = ["requirements.json", "acceptance-scenarios.json", "dependency-sbom.json", "control-manifest.json"];
writeJson("control-manifest.json", {
  schemaVersion: 1,
  kind: "control-manifest",
  generatedBy,
  authority: "derived control projections",
  source,
  generatedFiles,
  maintainedRegisters: [
    "decision-log.json",
    "phase0-acceptance.json",
    "mvp-acceptance.json",
    "support-matrix.json",
    "owner-registry.json",
    "capability-catalogue.json",
    "effect-outbox-policy.json",
    "credential-key-policy.json",
    "capability-coverage.json",
    "upstream.json",
    "patch-fork-delta.json",
    "license-provenance.json",
    "currentness-radar.json",
    "compatibility-matrix.json",
    "risk-threat-register.json",
    "migration-register.json",
    "release-evidence.json",
    "engineering-controller.json",
    "completion-ledger.json"
  ],
  counts: { requirements: requirements.length, acceptanceScenarios: acceptance.length, lockedPackages: lockedPackages.length }
});

console.log(`CONTROL_GENERATION_PASS requirements=${requirements.length} acceptance=${acceptance.length} packages=${lockedPackages.length} mpes=${source.mpes.sha256}`);
