import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const lockPath = join(root, "package-lock.json");
const lock = JSON.parse(readFileSync(lockPath, "utf8"));
const packages = Object.entries(lock.packages ?? {}).filter(([path]) => path.startsWith("node_modules/"));
const failures = [];
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

if (failures.length > 0) {
  console.error(`LICENSE_AUDIT_FAIL packages=${packages.length} failures=${failures.length}`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  const licenses = [...licenseCounts.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([license, count]) => `${license}:${count}`).join(",");
  const lockDigest = createHash("sha256").update(readFileSync(lockPath)).digest("hex");
  console.log(`LICENSE_AUDIT_PASS packages=${packages.length} licenses=${licenses} lockSha256=${lockDigest}`);
  console.log("LICENSE_AUDIT_LIMIT legal notice, source-obligation, rights, and security review remain release-visible.");
}
