import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const distRoot = join(root, "dist");
const serviceWorkerPath = join(distRoot, "sw.js");
const serviceWorkerSource = readFileSync(serviceWorkerPath, "utf8");

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
const serviceWorkerTemplate = serviceWorkerSource
  .replace('const CACHE_NAME = "omnevum-shell-v1";', 'const CACHE_NAME = "omnevum-shell-<build>";')
  .replace('const PRECACHE_URLS = ["./"];', 'const PRECACHE_URLS = ["<precache>"];');
digest.update(`service-worker-template\t${createHash("sha256").update(serviceWorkerTemplate).digest("hex")}\t${Buffer.byteLength(serviceWorkerTemplate)}\n`);
const buildId = digest.digest("hex").slice(0, 16);
const precacheUrls = ["./", ...files.map((file) => `./${file.path}`)];
const stamped = serviceWorkerSource
  .replace('const CACHE_NAME = "omnevum-shell-v1";', `const CACHE_NAME = "omnevum-shell-${buildId}";`)
  .replace('const PRECACHE_URLS = ["./"];', `const PRECACHE_URLS = ${JSON.stringify(precacheUrls)};`);
if (stamped === serviceWorkerSource) throw new Error("Service worker cache identity marker was not found");
if (!stamped.includes(`const PRECACHE_URLS = ${JSON.stringify(precacheUrls)};`)) throw new Error("Service worker precache marker was not found");
writeFileSync(serviceWorkerPath, stamped, "utf8");
console.log(`SERVICE_WORKER_STAMP_PASS cache=omnevum-shell-${buildId} precache=${precacheUrls.length}`);
