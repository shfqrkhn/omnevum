import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const bundlePath = join(root, "docs", "control", "recovery-bundle.json");
const failures = [];

if (!existsSync(bundlePath)) {
  console.error("RECOVERY_AUDIT_FAIL\n- missing docs/control/recovery-bundle.json");
  process.exitCode = 1;
} else {
  const bundle = JSON.parse(readFileSync(bundlePath, "utf8"));
  if (bundle.generatedBy !== "scripts/generate-control.mjs") failures.push("recovery bundle is not identified as generated");
  if (bundle.repository?.pathsAreRepositoryRelative !== true) failures.push("recovery paths are not repository-relative");
  if (bundle.repository?.secretsIncluded !== false) failures.push("recovery bundle does not declare secrets excluded");
  const files = bundle.integrity?.files;
  if (!Array.isArray(files) || files.length === 0) failures.push("recovery integrity manifest is empty");
  const seen = new Set();
  for (const item of files ?? []) {
    if (typeof item?.path !== "string" || /^[A-Za-z]:[\\/]/u.test(item.path) || item.path.startsWith("/")) {
      failures.push(`invalid non-relative integrity path ${String(item?.path)}`);
      continue;
    }
    if (seen.has(item.path)) failures.push(`duplicate integrity path ${item.path}`);
    seen.add(item.path);
    const absolute = join(root, item.path);
    if (!existsSync(absolute)) {
      failures.push(`missing integrity target ${item.path}`);
      continue;
    }
    const bytes = readFileSync(absolute);
    const actual = createHash("sha256").update(bytes).digest("hex");
    if (actual !== item.sha256) failures.push(`stale integrity hash ${item.path}`);
    if (bytes.byteLength !== item.bytes) failures.push(`stale integrity byte count ${item.path}`);
  }
  try {
    const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    if (bundle.repository?.revisionPolicy !== "generation-base-commit-retained-until-divergence") failures.push("unsupported recovery revision policy");
    if (bundle.repository?.revision !== revision) {
      try {
        execFileSync("git", ["merge-base", "--is-ancestor", bundle.repository?.revision, revision], { cwd: root, stdio: "ignore" });
      } catch {
        failures.push(`recovery generation revision is not an ancestor of HEAD ${bundle.repository?.revision}`);
      }
    }
  } catch {
    if (bundle.repository?.revision !== "NO_GIT_CONTEXT") failures.push("repository revision cannot be verified");
  }
}

if (failures.length > 0) {
  console.error(`RECOVERY_AUDIT_FAIL\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  const bundle = JSON.parse(readFileSync(bundlePath, "utf8"));
  console.log(`RECOVERY_AUDIT_PASS files=${bundle.integrity.files.length} sourceRevision=${bundle.repository.revision}`);
}
