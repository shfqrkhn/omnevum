import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const lockPath = join(root, "package-lock.json");
const compliancePath = join(root, "docs", "control", "foss-compliance.json");
const lock = JSON.parse(readFileSync(lockPath, "utf8"));
const packages = Object.entries(lock.packages ?? {}).filter(([path]) => path.startsWith("node_modules/"));
const failures = [];
const complianceFailures = [];
const licenseCounts = new Map();

for (const [path, metadata] of packages) {
  const name = path.slice("node_modules/".length);
  if (!metadata || typeof metadata !== "object") {
    failures.push(`${name}: missing lock metadata`);
    continue;
  }
  if (typeof metadata.version !== "string" || metadata.version.length === 0) failures.push(`${name}: missing version`);
  if (typeof metadata.resolved !== "string" || metadata.resolved.length === 0) failures.push(`${name}: missing resolved source`);
  if (typeof metadata.integrity !== "string" || metadata.integrity.length === 0) failures.push(`${name}: missing integrity`);
  if (typeof metadata.license !== "string" || metadata.license.length === 0 || metadata.license === "UNVERIFIED_NPM_METADATA") failures.push(`${name}: missing exact license metadata`);
  else licenseCounts.set(metadata.license, (licenseCounts.get(metadata.license) ?? 0) + 1);
}

const lockDigest = createHash("sha256").update(readFileSync(lockPath)).digest("hex");
if (!existsSync(compliancePath)) complianceFailures.push("missing generated docs/control/foss-compliance.json");
else {
  const compliance = JSON.parse(readFileSync(compliancePath, "utf8"));
  if (compliance?.source?.lockfile?.sha256 !== lockDigest) complianceFailures.push("foss compliance receipt is stale for package-lock.json");
  if (!Array.isArray(compliance?.attributionInventory) || compliance.attributionInventory.length !== packages.length) complianceFailures.push("attribution inventory does not cover every locked package");
  if (!Array.isArray(compliance?.policyCriticalFindings) || compliance.policyCriticalFindings.length > 0) complianceFailures.push("policy-critical compliance findings are unresolved");
  if (compliance?.status === "FAIL") complianceFailures.push("foss compliance receipt is FAIL");
}

if (failures.length > 0 || complianceFailures.length > 0) {
  console.error(`LICENSE_AUDIT_FAIL packages=${packages.length} failures=${failures.length + complianceFailures.length}`);
  [...failures, ...complianceFailures].forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  const licenses = [...licenseCounts.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([license, count]) => `${license}:${count}`).join(",");
  console.log(`LICENSE_AUDIT_PASS packages=${packages.length} licenses=${licenses} lockSha256=${lockDigest}`);
  const compliance = JSON.parse(readFileSync(compliancePath, "utf8"));
  console.log(`FOSS_COMPLIANCE_PASS packages=${packages.length} attribution=generated sourceObligationReviews=${compliance.sourceObligationReview.length} status=${compliance.status}`);
  if (compliance.status !== "PASS") console.log("FOSS_COMPLIANCE_LIMIT legal notice, source-obligation, rights, and security review remain release-visible.");
}
