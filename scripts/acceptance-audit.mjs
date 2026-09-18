import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const readJson = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
const scenarios = readJson("docs/control/acceptance-scenarios.json").items;
const results = readJson("docs/control/acceptance-results.json");
const allowed = new Set(["NOT_STARTED", "IN_PROGRESS", "PASS", "PARTIAL", "FAIL", "NOT_APPLICABLE", "UNKNOWN"]);
const failures = [];
if (results.generatedBy !== "scripts/generate-control.mjs") failures.push("acceptance result generator identity missing");
if (!Array.isArray(results.items) || results.items.length !== scenarios.length) failures.push(`result count=${results.items?.length ?? "invalid"} scenario count=${scenarios.length}`);
const scenarioIds = new Set(scenarios.map((item) => item.id));
const resultIds = new Set();
for (const item of results.items ?? []) {
  if (resultIds.has(item.id)) failures.push(`duplicate result ${item.id}`);
  resultIds.add(item.id);
  if (!scenarioIds.has(item.id)) failures.push(`result not in scenario register ${item.id}`);
  if (!allowed.has(item.status)) failures.push(`invalid status ${item.id}=${item.status}`);
  if (item.status === "PASS" && (!Array.isArray(item.evidence) || item.evidence.length === 0)) failures.push(`PASS without evidence ${item.id}`);
  if (item.status === "NOT_APPLICABLE" && (typeof item.notes !== "string" || !item.notes.trim())) failures.push(`NOT_APPLICABLE without rationale ${item.id}`);
  for (const evidence of item.evidence ?? []) {
    const path = String(evidence).split("#", 1)[0].trim();
    if (path && /^(?:docs|scripts|src|public)\//.test(path) && !existsSync(join(root, path))) failures.push(`missing evidence ${item.id}: ${path}`);
  }
}
if (resultIds.size !== scenarioIds.size) failures.push("scenario/result identity sets differ");
if (failures.length > 0) {
  console.error(`ACCEPTANCE_AUDIT_FAIL\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  const counts = Object.fromEntries([...allowed].map((status) => [status, (results.items ?? []).filter((item) => item.status === status).length]));
  console.log(`ACCEPTANCE_AUDIT_PASS items=${results.items.length} counts=${JSON.stringify(counts)}`);
}
