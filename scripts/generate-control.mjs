import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
const priorAcceptanceResultsPath = join(controlRoot, "acceptance-results.json");
const priorAcceptanceResults = existsSync(priorAcceptanceResultsPath) ? JSON.parse(readFileSync(priorAcceptanceResultsPath, "utf8")) : undefined;
const priorAcceptanceById = new Map(Array.isArray(priorAcceptanceResults?.items) ? priorAcceptanceResults.items.filter((item) => item && typeof item.id === "string").map((item) => [item.id, item]) : []);
const acceptanceResults = acceptance.map((scenario) => {
  const prior = priorAcceptanceById.get(scenario.id);
  return {
    ...scenario,
    status: typeof prior?.status === "string" ? prior.status : "UNKNOWN",
    evidence: Array.isArray(prior?.evidence) ? prior.evidence.filter((item) => typeof item === "string") : [],
    ...(typeof prior?.notes === "string" ? { notes: prior.notes } : {})
  };
});
const resultStatuses = new Set(acceptanceResults.map((item) => item.status));
const resultStatus = resultStatuses.has("FAIL") ? "FAIL" : resultStatuses.has("UNKNOWN") || resultStatuses.has("PARTIAL") ? "PARTIAL" : resultStatuses.has("IN_PROGRESS") ? "IN_PROGRESS" : "PASS";
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
writeJson("acceptance-results.json", {
  schemaVersion: 1,
  kind: "acceptance-result-register",
  generatedBy,
  authority: "maintained status overlay on the generated acceptance-scenario register",
  source,
  profile: "mvp",
  status: resultStatus,
  statusValues: ["NOT_STARTED", "IN_PROGRESS", "PASS", "PARTIAL", "FAIL", "NOT_APPLICABLE", "UNKNOWN"],
  evidencePolicy: "PASS requires reproducible evidence; NOT_APPLICABLE requires a bounded profile rationale; UNKNOWN remains release-visible.",
  items: acceptanceResults
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
const sourceObligationLicenses = new Set(["MPL-2.0", "GPL-2.0-only", "GPL-2.0-or-later", "GPL-3.0-only", "GPL-3.0-or-later", "AGPL-3.0-only", "AGPL-3.0-or-later"]);
const policyCriticalFindings = lockedPackages.flatMap((pkg) => [
  ...(pkg.version === "UNKNOWN" ? [`${pkg.name}: missing version`] : []),
  ...(pkg.resolved === null ? [`${pkg.name}: missing resolved source`] : []),
  ...(pkg.integrity === null ? [`${pkg.name}: missing integrity`] : []),
  ...(pkg.license === "UNVERIFIED_NPM_METADATA" ? [`${pkg.name}: missing exact license metadata`] : [])
]);
const sourceObligationReview = lockedPackages.filter((pkg) => sourceObligationLicenses.has(pkg.license)).map((pkg) => ({
  package: `${pkg.name}@${pkg.version}`,
  license: pkg.license,
  status: "REVIEW_REQUIRED",
  reason: "Exact notice, source-availability, and distribution obligations require release-profile review."
}));
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

writeJson("foss-compliance.json", {
  schemaVersion: 1,
  kind: "foss-compliance-receipt",
  generatedBy,
  authority: "automated release-plane projection; not legal advice or a substitute for rights review",
  package: { name: packageJson.name, version: packageJson.version },
  source: { lockfile: source.lockfile },
  status: policyCriticalFindings.length > 0 ? "FAIL" : sourceObligationReview.length > 0 ? "PASS_WITH_REVIEW_LIMITATIONS" : "PASS",
  policyCriticalFindings,
  sourceObligationReview,
  attributionInventory: lockedPackages.map((pkg) => ({
    package: `${pkg.name}@${pkg.version}`,
    license: pkg.license,
    source: pkg.resolved,
    attribution: `${pkg.name}@${pkg.version} — ${pkg.license}`
  })),
  generatedOutputs: ["docs/control/dependency-sbom.json", "docs/control/foss-compliance.json"],
  policy: [
    "Every locked package must have exact version, resolved source, integrity, and license metadata.",
    "Attribution inventory and source-obligation review are regenerated from package-lock.json; they are not hand-maintained copies.",
    "Policy-critical metadata findings fail the release gate; legal/source-obligation review remains release-visible until resolved."
  ]
});

const generatedFiles = ["requirements.json", "acceptance-scenarios.json", "acceptance-results.json", "dependency-sbom.json", "foss-compliance.json", "control-manifest.json", "recovery-bundle.json"];
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
  canonicalDatasets: [
    { id: "omni-doctrine", path: source.omni.path },
    { id: "mpes", path: source.mpes.path },
    { id: "package-manifest", path: source.package.path },
    { id: "lockfile", path: source.lockfile.path }
  ],
  relocations: [],
  retiredPaths: [],
  counts: { requirements: requirements.length, acceptanceScenarios: acceptance.length, lockedPackages: lockedPackages.length }
});

const gitRevision = (() => {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim() || "NO_GIT_CONTEXT";
  } catch {
    return "NO_GIT_CONTEXT";
  }
})();
const repositoryFiles = (() => {
  try {
    return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" })
      .split(/\r?\n/)
      .map((path) => path.trim().replaceAll("\\", "/"))
      .filter((path) => path && !path.startsWith("node_modules/") && !path.startsWith("dist/") && path !== "docs/control/control-manifest.json" && path !== "docs/control/recovery-bundle.json")
      .sort();
  } catch {
    return ["AGENTS.md", "README.md", "package.json", "package-lock.json", "vite.config.ts", "tsconfig.json", "docs/Omni_3.32.0.md", "docs/Omnevum-MPES-v0.12.0-converged.md"];
  }
})();
const integrityFiles = repositoryFiles.filter((path) => existsSync(join(root, path))).map((path) => {
  const bytes = readFileSync(join(root, path));
  return { path, sha256: sha256(bytes), bytes: bytes.byteLength };
});
writeJson("recovery-bundle.json", {
  schemaVersion: 1,
  kind: "engineering-recovery-bundle",
  generatedBy,
  authority: "MPES Sections 20.5, 20.9, and 20.10; integrity manifest is a generated projection",
  source,
  repository: { revision: gitRevision, revisionPolicy: "generation-base-commit-must-ancestor-of-current", pathsAreRepositoryRelative: true, secretsIncluded: false },
  restoreProcedure: [
    "Read docs/Omni_3.32.0.md and docs/Omnevum-MPES-v0.12.0-converged.md before changing scope.",
    "Inspect docs/control/completion-ledger.json, engineering-controller.json, release-evidence.json, acceptance-results.json, support-matrix.json, and risk-threat-register.json.",
    "Run npm ci, npm run audit:recovery, and npm run ci from a clean checkout before resuming implementation.",
    "Use docs/evidence/ as dated receipts and update the canonical control register in the same verified increment.",
    "Re-establish any external authority or credentials in the current environment; no credential, lease, or pending effect is restored as active by this bundle."
  ],
  canonicalReferences: {
    authority: ["docs/Omni_3.32.0.md", "docs/Omnevum-MPES-v0.12.0-converged.md"],
    controls: ["docs/control/control-manifest.json", "docs/control/requirements.json", "docs/control/acceptance-scenarios.json", "docs/control/acceptance-results.json", "docs/control/phase0-acceptance.json", "docs/control/mvp-acceptance.json", "docs/control/support-matrix.json", "docs/control/owner-registry.json", "docs/control/capability-catalogue.json", "docs/control/effect-outbox-policy.json", "docs/control/credential-key-policy.json", "docs/control/capability-coverage.json", "docs/control/upstream.json", "docs/control/patch-fork-delta.json", "docs/control/license-provenance.json", "docs/control/currentness-radar.json", "docs/control/compatibility-matrix.json", "docs/control/risk-threat-register.json", "docs/control/migration-register.json", "docs/control/release-evidence.json", "docs/control/engineering-controller.json", "docs/control/completion-ledger.json"],
    evidence: ["docs/evidence/"],
    implementation: ["src/main.ts", "src/core/", "src/ui/", "public/sw.js", "scripts/"],
    tests: ["src/**/*.test.ts", "npm run ci"]
  },
  releaseState: "docs/control/release-evidence.json",
  pendingExternalEffects: "docs/control/effect-outbox-policy.json and the shipped Recovery ledger are authoritative; this bundle contains no effect payload, credential, token, lease, or private path.",
  integrity: { algorithm: "SHA-256 of repository-relative file bytes", excludes: ["docs/control/control-manifest.json", "docs/control/recovery-bundle.json"], files: integrityFiles }
});

console.log(`CONTROL_GENERATION_PASS requirements=${requirements.length} acceptance=${acceptance.length} packages=${lockedPackages.length} mpes=${source.mpes.sha256}`);
