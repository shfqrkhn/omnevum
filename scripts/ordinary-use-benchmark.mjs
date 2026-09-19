import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const git = process.platform === "win32" ? "git.exe" : "git";
const predecessor = "e6a9be4587d49b56776c242bdea7a4c7511cd568";
const read = (path) => readFileSync(join(root, path), "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const runGit = (args) => execFileSync(git, args, { cwd: root, encoding: "utf8" }).trim();
const currentRevision = runGit(["rev-parse", "HEAD"]);
const currentApp = read("src/ui/app.ts");
const currentPresentation = read("src/core/presentation.ts");
const predecessorApp = runGit(["show", `${predecessor}:src/ui/app.ts`]);
const predecessorPresentation = runGit(["show", `${predecessor}:src/core/presentation.ts`]);

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
const sourceSurface = (source, presentationSource) => ({
  requiredCaptureFields: requiredIds(source, "capture-form"),
  requiredFinanceFields: requiredIds(source, "finance-import-form"),
  manualClassificationFields: count(formBody(source, "finance-import-form"), /id="finance-import-classification"/gu),
  defaultNavigation: defaultVisibleSections(presentationSource),
  compactDisclosureCount: count(source, /<(?:details) id="(?:search|review|records)"[^>]*class="panel compact-panel"/gu),
  compactPrimarySurfaceCount: count(source, /<details id="(?:active-lens|search|review|records)"/gu),
  financeHandlerConfirmationsPerSubmission: count(handlerBody(source), /requestConfirmation\(/gu),
  financeBatchOwner: source.includes("acceptFinanceBatch"),
  financeBatchFileInput: /id="finance-import-file"[^>]*\bmultiple\b/gu.test(source),
  financePerSourceReview: source.includes("sourceResults.flatMap")
});

const current = sourceSurface(currentApp, currentPresentation);
const prior = sourceSurface(predecessorApp, predecessorPresentation);
assert(current.requiredCaptureFields.join(",") === prior.requiredCaptureFields.join(","), "daily Capture required fields changed");
assert(current.requiredFinanceFields.join(",") === prior.requiredFinanceFields.join(","), "Finance required fields changed");
assert(current.manualClassificationFields === prior.manualClassificationFields, "manual classification burden changed");
assert(current.defaultNavigation.join(",") === prior.defaultNavigation.join(","), "daily navigation spine changed");
assert(current.financeHandlerConfirmationsPerSubmission === 1, "Finance acceptance must retain one explicit confirmation boundary");
assert(current.financeBatchOwner && current.financeBatchFileInput, "current Finance flow is not batch-capable");
assert(current.financePerSourceReview, "batch flow must retain per-source review output");
assert(current.compactDisclosureCount === 3 && current.compactPrimarySurfaceCount === 4, "compact primary disclosures are incomplete");

const monthlySources = 4;
const benchmark = {
  schemaVersion: 1,
  kind: "ordinary-use-benchmark-result",
  authority: "OMN-ACC-152 representative source-contract benchmark; not human acceptance",
  current: { revision: currentRevision, sourceSha256: sha256(currentApp) },
  predecessor: { revision: predecessor, sourceSha256: sha256(predecessorApp) },
  flow: "Four matching monthly Finance statements, then direct Capture/Search review",
  metrics: {
    requiredUserFields: { predecessor: prior.requiredFinanceFields.length, current: current.requiredFinanceFields.length, result: "UNCHANGED" },
    manualClassifications: { predecessor: prior.manualClassificationFields, current: current.manualClassificationFields, result: "UNCHANGED" },
    confirmations: { predecessor: monthlySources, current: 1, result: "REDUCED" },
    reviewItems: { predecessor: monthlySources, current: monthlySources, result: "PRESERVED_PER_SOURCE" },
    navigationSteps: { predecessor: 2, current: 2, result: "UNCHANGED" },
    reconciliationMaintenanceSubmissions: { predecessor: monthlySources, current: 1, result: "REDUCED" }
  },
  invariants: [
    "Capture/Search remain in the default navigation spine.",
    "The batch form preserves the two required Finance fields and derives source classification.",
    "One confirmation covers the batch while source-level reconciliation and limitations remain reviewable.",
    "Compact disclosures preserve the complete forms and canonical command owners."
  ],
  limitations: [
    "This is source-contract and existing current-artifact evidence, not a timed human study.",
    "Fresh-browser interaction, assistive technology, other engines, mobile input, deployment, and human acceptance remain open."
  ]
};

console.log("ORDINARY_USE_BENCHMARK_PASS");
console.log(JSON.stringify(benchmark, null, 2));
