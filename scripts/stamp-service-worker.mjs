import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const distRoot = join(root, "dist");
const serviceWorkerPath = join(distRoot, "sw.js");

const walk = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? walk(path) : [path];
});

const digest = createHash("sha256");
const files = walk(distRoot)
  .filter((path) => path !== serviceWorkerPath)
  .map((path) => {
    const bytes = readFileSync(path);
    return { path: relative(distRoot, path).replaceAll("\\", "/"), bytes, size: statSync(path).size };
  })
  .sort((left, right) => left.path.localeCompare(right.path));
for (const file of files) {
  digest.update(`${file.path}\t${createHash("sha256").update(file.bytes).digest("hex")}\t${file.size}\n`);
}
const buildId = digest.digest("hex").slice(0, 16);
const source = readFileSync(serviceWorkerPath, "utf8");
const stamped = source.replace('const CACHE_NAME = "omnevum-shell-v1";', `const CACHE_NAME = "omnevum-shell-${buildId}";`);
if (stamped === source) throw new Error("Service worker cache identity marker was not found");
writeFileSync(serviceWorkerPath, stamped, "utf8");
console.log(`SERVICE_WORKER_STAMP_PASS cache=omnevum-shell-${buildId}`);
