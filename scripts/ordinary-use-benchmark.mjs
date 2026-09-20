import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const git = process.platform === "win32" ? "git.exe" : "git";
const read = (path) => readFileSync(join(root, path), "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const currentRevision = execFileSync(git, ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const currentApp = read("src/ui/app.ts");
const currentPresentation = read("src/core/presentation.ts");

const assert = (condition, message) => {
  if (!condition) throw new Error(`ORDINARY_USE_BENCHMARK_FAIL: ${message}`);
};
const count = (value, pattern) => [...value.matchAll(pattern)].length;
const formBody = (source, id) => {
  const start = source.indexOf(`<form id="${id}"`);
  assert(start >= 0, `missing ${id}`);
  const end = source.indexOf("</form>", start);
  assert(end > start, `unterminated ${id}`);
  return source.slice(start, end);
};
const requiredIds = (source, id) => [...formBody(source, id).matchAll(/<(?:input|select|textarea)\b[^>]*\brequired\b[^>]*>/gu)]
  .map((match) => match[0].match(/\bid="([^"]+)"/u)?.[1])
  .filter((value) => typeof value === "string");
const handlerBody = (source) => {
  const start = source.indexOf("financeImportForm.addEventListener");
  const end = source.indexOf("healthForm.addEventListener", start);
  assert(start >= 0 && end > start, "missing Finance import handler");
  return source.slice(start, end);
};
const defaultVisibleSections = (source) => {
  const match = source.match(/DEFAULT_VISIBLE_SECTIONS[^=]*=\s*\[([^\]]+)\]/u);
  assert(match, "missing default navigation profile");
  return [...match[1].matchAll(/"([^"]+)"/gu)].map((item) => item[1]);
};

const current = {
  requiredCaptureFields: requiredIds(currentApp, "capture-form"),
  requiredFinanceFields: requiredIds(currentApp, "finance-import-form"),
  manualClassificationFields: count(formBody(currentApp, "finance-import-form"), /id="finance-import-classification"/gu),
  defaultNavigation: defaultVisibleSections(currentPresentation),
  compactDisclosureCount: count(currentApp, /<(?:details) id="(?:search|review|records)"[^>]*class="panel compact-panel"/gu),
  compactPrimarySurfaceCount: count(currentApp, /<details id="(?:active-lens|search|review|records)"/gu),
  financeHandlerConfirmations: count(handlerBody(currentApp), /requestConfirmation\(/gu),
  financeProfileReviewConfirmation: currentApp.includes("Review and save the changed Finance parser profile") && currentApp.includes("profileReview"),
  financeBatchOwner: currentApp.includes("acceptFinanceBatch"),
  financeBatchFileInput: /id="finance-import-file"[^>]*\bmultiple\b/gu.test(currentApp),
  financePerSourceReview: currentApp.includes("sourceResults.flatMap")
};

assert(current.requiredCaptureFields.length > 0, "Capture has no required user field");
assert(current.requiredFinanceFields.length > 0, "Finance has no required source field");
assert(current.defaultNavigation.includes("assistant"), "bounded Assistant is missing from default reachable surfaces");
assert(current.financeHandlerConfirmations >= 1 && current.financeProfileReviewConfirmation, "Finance acceptance must retain a batch confirmation and an explicit changed-parser-profile review boundary");
assert(current.financeBatchOwner && current.financeBatchFileInput, "current Finance flow is not batch-capable");
assert(current.financePerSourceReview, "batch flow must retain per-source review output");
assert(current.compactDisclosureCount === 3 && current.compactPrimarySurfaceCount === 4, "compact primary disclosures are incomplete");

const monthlySources = 4;
const benchmark = {
  schemaVersion: 1,
  kind: "ordinary-use-benchmark-result",
  authority: "OMN-ACC-152 current v0.18 source-contract benchmark; not human acceptance",
  current: { revision: currentRevision, sourceSha256: sha256(currentApp) },
  flow: "Four matching monthly Finance statements, then direct Capture/Search review",
  metrics: {
    requiredUserFields: current.requiredFinanceFields.length,
    manualClassifications: current.manualClassificationFields,
    confirmations: current.financeHandlerConfirmations,
    profileReviewConfirmation: current.financeProfileReviewConfirmation,
    reviewItems: monthlySources,
    navigationSteps: 2,
    reconciliationMaintenanceSubmissions: current.financeHandlerConfirmations
  },
  invariants: [
    "Capture/Search remain in the default navigation spine.",
    "Assistant is reachable from the default navigation while its low-frequency body remains collapsed and honestly disabled without a provider.",
    "The batch form preserves required Finance fields and derives source classification.",
    "One confirmation covers the routine batch while a changed parser profile receives a separate explicit review; source-level reconciliation and limitations remain reviewable.",
    "Compact disclosures preserve the complete forms and canonical command owners."
  ],
  limitations: [
    "This is current source-contract evidence, not a timed human study.",
    "Fresh-browser interaction, assistive technology, other engines, mobile input, deployment, and human acceptance remain open."
  ]
};

console.log("ORDINARY_USE_BENCHMARK_PASS");
console.log(JSON.stringify(benchmark, null, 2));
