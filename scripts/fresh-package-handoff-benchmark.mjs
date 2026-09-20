import { fileURLToPath } from "node:url";
import "fake-indexeddb/auto";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ root, appType: "custom", logLevel: "error", server: { hmr: false, middlewareMode: true } });
const { createRecordAppDefinition } = await vite.ssrLoadModule("/src/core/factory.ts");
const { CanonicalStore } = await vite.ssrLoadModule("/src/core/storage.ts");
const { CommandBus } = await vite.ssrLoadModule("/src/core/commands.ts");
const { createPackageAutomationAdapter, MAX_AUTOMATION_DOCUMENT_BYTES } = await vite.ssrLoadModule("/src/core/package-automation.ts");
const { PackageAutomationRegistry } = await vite.ssrLoadModule("/src/core/package-automation-registry.ts");
const { PackageRegistry, assertPackageManifest, generateBaselineView, isPackageManifest } = await vite.ssrLoadModule("/src/core/package-contract.ts");

const REQUIRED_OBLIGATIONS = [
  "canonicalOwnerAuthority",
  "privacySecurity",
  "accessibility",
  "updateInvalidation",
  "verification",
  "recovery",
  "versioning",
  "maintenance",
  "retirement",
  "onwardDescendant"
];

const PACKAGE_ID = "benchmark.first-party.handoff";
const RULE_ID = `${PACKAGE_ID}.review`;
const FIELD_DEFINITION = [
  { id: "title", type: "text", required: true, labels: { "en-CA": "Title", "fr-CA": "Titre" } },
  { id: "priority", type: "number", labels: { "en-CA": "Priority", "fr-CA": "Priorité" } },
  { id: "tags", type: "tags", labels: { "en-CA": "Tags", "fr-CA": "Étiquettes" } }
];

const PACKAGE_MANIFEST = {
  packageId: PACKAGE_ID,
  version: "1.0.0",
  displayName: "Fresh handoff benchmark",
  trustClass: "FIRST_PARTY",
  frameworkApi: "omnevum-sdk-1",
  entrypoints: ["declarative"],
  ownedCanonicalTypes: ["benchmark.first-party.entry"],
  commands: { consumes: ["record.create", "record.update"], provides: [] },
  capabilities: { required: ["record", "vault"], optional: ["automation"] },
  permissions: ["automation.proposal"],
  externalEffects: [],
  dataSchema: "benchmark-first-party-entry-v1",
  migrations: [],
  lifecycle: { offline: "full", recovery: "vault", rollback: "schema-compatible", uninstall: "retain-export", retirement: "stop-and-retain-export" },
  accessibility: "WCAG-2.2-AA",
  inputProfile: ["keyboard", "touch"],
  localization: ["en-CA", "fr-CA"]
};

const WORKFLOW_MANIFEST = {
  schemaVersion: 1,
  ruleId: RULE_ID,
  version: 1,
  trigger: "ON_CAPTURE",
  when: { op: "eq", left: { kind: "path", path: "record.factoryPackage" }, right: { kind: "literal", value: PACKAGE_ID } },
  actions: [{ command: "record.update", arguments: { recordId: "synthetic-record-001", field: "workflowStatus", value: "REVIEW" } }],
  enabled: true
};

const OBLIGATIONS = {
  canonicalOwnerAuthority: { required: true, boundary: "Factory-created records use the package ID as owner; the package alone owns its canonical type." },
  privacySecurity: { required: true, boundary: "Private synthetic records; declarative proposal-only automation; no network, credential, or external-effect authority." },
  accessibility: { required: true, boundary: "WCAG-2.2-AA claim is limited to the declared keyboard/touch and en-CA/fr-CA contract." },
  updateInvalidation: { required: true, boundary: "Disabled or retired package/workflow state produces no preview and rejects stale proposals." },
  verification: { required: true, boundary: "Manifest, workflow, generated baseline view, factory runtime, and proposal shape are rechecked." },
  recovery: { required: true, boundary: "Only serialized manifest, fields, workflow, and automation state are needed for fresh restoration." },
  versioning: { required: true, boundary: "Package uses semver; workflow and schema versions are positive and mismatches fail closed." },
  maintenance: { required: true, boundary: "Document, fields, actions, and manifest lists remain within existing bounded API limits." },
  retirement: { required: true, boundary: "Retirement suppresses workflow proposals and preserves export-oriented lifecycle intent." },
  onwardDescendant: { required: true, boundary: "Any descendant must carry the same applicable authority, privacy, accessibility, lifecycle, verification, recovery, version, maintenance, and retirement obligations." }
};

const HANDOFF = {
  format: "OMNEVUM_FIRST_PARTY_PACKAGE_WORKFLOW_HANDOFF",
  version: 1,
  synthetic: true,
  packageManifest: PACKAGE_MANIFEST,
  workflowManifest: WORKFLOW_MANIFEST,
  fields: FIELD_DEFINITION,
  obligations: OBLIGATIONS
};

const assert = (condition, message) => {
  if (!condition) throw new Error(`FRESH_PACKAGE_HANDOFF_BENCHMARK_FAIL: ${message}`);
};

const checks = [];
const check = (name, condition, message) => {
  assert(condition, message);
  checks.push(name);
};

const validateObligations = (handoff) => {
  for (const name of REQUIRED_OBLIGATIONS) {
    const obligation = handoff.obligations?.[name];
    assert(obligation?.required === true && typeof obligation.boundary === "string" && obligation.boundary.trim().length > 0, `missing obligation: ${name}`);
  }
};

const cloneJson = (value) => JSON.parse(JSON.stringify(value));
const workflowDocument = JSON.stringify(WORKFLOW_MANIFEST);

validateObligations(HANDOFF);
assertPackageManifest(PACKAGE_MANIFEST);
const app = createRecordAppDefinition({ manifest: PACKAGE_MANIFEST, title: { "en-CA": PACKAGE_MANIFEST.displayName, "fr-CA": "Benchmark de transfert frais" }, fields: FIELD_DEFINITION });
const directAdapter = createPackageAutomationAdapter(PACKAGE_MANIFEST, WORKFLOW_MANIFEST);
const packageRegistry = new PackageRegistry();
const installed = packageRegistry.install(PACKAGE_MANIFEST);
const automationRegistry = new PackageAutomationRegistry(packageRegistry);
const installedWorkflow = automationRegistry.install(PACKAGE_ID, workflowDocument);

check("manifest-validation", isPackageManifest(PACKAGE_MANIFEST) && installed.status === "INSTALLED", "generated first-party package manifest was not admitted");
check("factory-baseline", app.baselineView.id === `${PACKAGE_ID}.baseline` && app.baselineView.source === "PACKAGE" && generateBaselineView(PACKAGE_MANIFEST, app.fields.map(({ id }) => id)).widgets.length === 2, "factory baseline view is not package-owned");
check("workflow-validation", installedWorkflow.ruleId === RULE_ID && directAdapter.rule.ruleId === RULE_ID && Object.isFrozen(directAdapter.rule), "workflow was not admitted through package automation APIs");

const database = new CanonicalStore("omnevum-fresh-package-handoff-benchmark");
await database.open();
try {
  const commands = new CommandBus(database);
  const runtime = app.createRuntime(commands);
  const captured = await runtime.capture({ title: "Synthetic handoff record", priority: 2, tags: ["synthetic"] });
  check("canonical-owner", captured.owner === PACKAGE_ID && captured.data.factoryPackage === PACKAGE_ID && captured.data.factorySchema === PACKAGE_MANIFEST.dataSchema, "factory record crossed its canonical owner boundary");
  check("privacy", captured.sensitivity === "PRIVATE" && captured.truthClass === "USER_OBSERVATION", "synthetic factory record is not private user-observation data");
  const updated = await runtime.update(captured.id, { title: "Synthetic handoff record updated", priority: 3, tags: ["synthetic", "updated"] }, captured.revision);
  check("record-update", updated.revision === captured.revision + 1 && updated.owner === PACKAGE_ID && updated.data.title === "Synthetic handoff record updated", "factory update did not preserve canonical ownership or revision");
} finally {
  database.close();
}

check("privacy-security", PACKAGE_MANIFEST.trustClass === "FIRST_PARTY"
  && PACKAGE_MANIFEST.entrypoints.length === 1
  && PACKAGE_MANIFEST.entrypoints[0] === "declarative"
  && PACKAGE_MANIFEST.permissions.length === 1
  && PACKAGE_MANIFEST.permissions[0] === "automation.proposal"
  && PACKAGE_MANIFEST.externalEffects.length === 0
  && PACKAGE_MANIFEST.commands.provides.length === 0
  && PACKAGE_MANIFEST.externalEffects.every((effect) => !/network|credential/iu.test(effect)), "package grants an unbounded privacy or execution surface");
check("accessibility", PACKAGE_MANIFEST.accessibility === "WCAG-2.2-AA"
  && PACKAGE_MANIFEST.inputProfile.includes("keyboard")
  && PACKAGE_MANIFEST.inputProfile.includes("touch")
  && PACKAGE_MANIFEST.localization.includes("en-CA")
  && PACKAGE_MANIFEST.localization.includes("fr-CA")
  && FIELD_DEFINITION.every((field) => field.labels["en-CA"] && field.labels["fr-CA"]), "declared accessibility/localization boundary is incomplete");

const initialProposals = automationRegistry.preview("ON_CAPTURE", { record: { factoryPackage: PACKAGE_ID } });
assert(initialProposals.length === 1, "enabled workflow did not produce its bounded preview");
const staleProposal = cloneJson(initialProposals[0]);
check("proposal-boundary", staleProposal.requiresNormalCommandPath === true && staleProposal.command === "record.update" && staleProposal.arguments.field === "workflowStatus", "automation escaped proposal-only normal command authority");

automationRegistry.disable(RULE_ID, "synthetic maintenance pause");
check("workflow-invalidation", automationRegistry.preview("ON_CAPTURE", { record: { factoryPackage: PACKAGE_ID } }).length === 0 && !automationRegistry.ownsProposal(staleProposal), "disabled workflow left an actionable or owned stale proposal");
automationRegistry.enable(RULE_ID);
check("workflow-reenable", automationRegistry.preview("ON_CAPTURE", { record: { factoryPackage: PACKAGE_ID } }).length === 1, "explicit workflow re-enable did not restore preview");

const checkpoint = cloneJson({ packageManifest: PACKAGE_MANIFEST, workflowManifest: WORKFLOW_MANIFEST, fields: FIELD_DEFINITION, automationState: automationRegistry.exportState() });
const freshPackageRegistry = new PackageRegistry();
freshPackageRegistry.install(checkpoint.packageManifest);
const freshApp = createRecordAppDefinition({ manifest: checkpoint.packageManifest, title: { "en-CA": checkpoint.packageManifest.displayName, "fr-CA": "Benchmark de transfert frais" }, fields: checkpoint.fields });
const freshAutomationRegistry = new PackageAutomationRegistry(freshPackageRegistry);
const restored = freshAutomationRegistry.restoreState(checkpoint.automationState);
const freshProposals = freshAutomationRegistry.preview("ON_CAPTURE", { record: { factoryPackage: PACKAGE_ID } });
check("fresh-resumption", restored.restored === 1 && restored.skipped === 0 && freshApp.baselineView.id === `${PACKAGE_ID}.baseline` && freshProposals.length === 1, "fresh restoration required chat history or failed to restore the serialized handoff");

const unavailableRegistry = new PackageAutomationRegistry(new PackageRegistry());
const skipped = unavailableRegistry.restoreState(checkpoint.automationState);
check("recovery-absence", skipped.restored === 0 && skipped.skipped === 1 && unavailableRegistry.list().length === 0, "automation restored without its installed package authority");

const mismatchedVersionState = checkpoint.automationState.map((state) => ({ ...state, ruleVersion: state.ruleVersion + 1 }));
const versionRegistry = new PackageAutomationRegistry(freshPackageRegistry);
let mismatchRejected = false;
try {
  versionRegistry.restoreState(mismatchedVersionState);
} catch (error) {
  mismatchRejected = error instanceof Error && (error.message.includes("Invalid Vault package automation") || error.message.includes("does not match"));
}
check("versioning", /^\d+\.\d+\.\d+$/.test(PACKAGE_MANIFEST.version)
  && Number.isSafeInteger(WORKFLOW_MANIFEST.version)
  && WORKFLOW_MANIFEST.version > 0
  && PACKAGE_MANIFEST.dataSchema.endsWith("-v1")
  && mismatchRejected, "package/workflow version mismatch was not rejected fail-closed");
check("maintenance-bounds", new TextEncoder().encode(workflowDocument).byteLength <= MAX_AUTOMATION_DOCUMENT_BYTES
  && FIELD_DEFINITION.length <= 50
  && WORKFLOW_MANIFEST.actions.length <= 20
  && PACKAGE_MANIFEST.entrypoints.length <= 50
  && PACKAGE_MANIFEST.ownedCanonicalTypes.length <= 50, "generated handoff exceeds an existing bounded API budget");

const freshStaleProposal = cloneJson(freshProposals[0]);
freshPackageRegistry.disable(PACKAGE_ID, "synthetic package update");
check("package-invalidation", freshAutomationRegistry.preview("ON_CAPTURE", { record: { factoryPackage: PACKAGE_ID } }).length === 0 && !freshAutomationRegistry.ownsProposal(freshStaleProposal), "package disable did not invalidate workflow proposals");
freshPackageRegistry.retire(PACKAGE_ID);
check("retirement", freshPackageRegistry.get(PACKAGE_ID)?.status === "RETIRED"
  && freshAutomationRegistry.preview("ON_CAPTURE", { record: { factoryPackage: PACKAGE_ID } }).length === 0
  && PACKAGE_MANIFEST.lifecycle.uninstall === "retain-export"
  && PACKAGE_MANIFEST.lifecycle.retirement.includes("stop"), "retirement did not stop proposals or retain export intent");

const result = {
  format: HANDOFF.format,
  version: HANDOFF.version,
  status: "PASS",
  synthetic: true,
  packageId: PACKAGE_ID,
  packageVersion: PACKAGE_MANIFEST.version,
  workflowId: RULE_ID,
  workflowVersion: WORKFLOW_MANIFEST.version,
  checks,
  checkCount: checks.length,
  freshResumption: { chatHistory: false, network: false, credentials: false, restored: restored.restored, skippedWithoutPackage: skipped.skipped },
  boundaries: Object.fromEntries(REQUIRED_OBLIGATIONS.map((name) => [name, HANDOFF.obligations[name].boundary])),
  limitations: [
    "Synthetic source-contract benchmark only; it does not perform browser, assistive-technology, or human acceptance testing.",
    "No network, credentials, package installation, signing, deployment, UI change, core change, docs/control/evidence edit, commit, or push was performed.",
    "Fresh resumption is simulated by serialized in-memory handoff state and new registries in one process; clean-machine and cross-version artifact restoration remain outside scope."
  ]
};

await vite.close();
console.log("FRESH_PACKAGE_HANDOFF_BENCHMARK_PASS");
console.log(JSON.stringify(result, null, 2));
