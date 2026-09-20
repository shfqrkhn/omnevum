import { createHash, randomUUID } from "node:crypto";
import { closeSync, fsyncSync, openSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const distRoot = join(root, "dist");
const serviceWorkerPath = join(distRoot, "sw.js");
const CACHE_NAME_MARKER = 'const CACHE_NAME = "omnevum-shell-v1";';
const PRECACHE_URLS_MARKER = 'const PRECACHE_URLS = ["./"];';

const walk = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? walk(path) : [path];
});

function replaceUnique(source, marker, replacement, label) {
  const occurrences = source.split(marker).length - 1;
  if (occurrences !== 1) throw new Error(`Service worker ${label} marker must occur exactly once`);
  return source.replace(marker, replacement);
}

export function stampServiceWorkerSource(source, buildId, precacheUrls) {
  const template = replaceUnique(source, CACHE_NAME_MARKER, 'const CACHE_NAME = "omnevum-shell-<build>";', "cache identity");
  replaceUnique(template, PRECACHE_URLS_MARKER, 'const PRECACHE_URLS = ["<precache>"];', "precache");
  const stamped = replaceUnique(source, CACHE_NAME_MARKER, `const CACHE_NAME = "omnevum-shell-${buildId}";`, "cache identity");
  return replaceUnique(stamped, PRECACHE_URLS_MARKER, `const PRECACHE_URLS = ${JSON.stringify(precacheUrls)};`, "precache");
}

export function writeFileAtomically(path, contents) {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  let descriptor;
  try {
    descriptor = openSync(temporaryPath, "wx");
    writeFileSync(descriptor, contents, "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporaryPath, path);
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    try { unlinkSync(temporaryPath); } catch { /* The temporary file may not have been created. */ }
    throw error;
  }
}

export function stampServiceWorkerFile(distDirectory, workerPath = join(distDirectory, "sw.js")) {
  const serviceWorkerSource = readFileSync(workerPath, "utf8");
  const digest = createHash("sha256");
  const files = walk(distDirectory)
    .filter((path) => path !== workerPath)
    .map((path) => {
      const bytes = readFileSync(path);
      return { path: relative(distDirectory, path).replaceAll("\\", "/"), bytes, size: statSync(path).size };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
  for (const file of files) {
    digest.update(`${file.path}\t${createHash("sha256").update(file.bytes).digest("hex")}\t${file.size}\n`);
  }
  const serviceWorkerTemplate = replaceUnique(serviceWorkerSource, CACHE_NAME_MARKER, 'const CACHE_NAME = "omnevum-shell-<build>";', "cache identity");
  const templateWithPrecacheMarker = replaceUnique(serviceWorkerTemplate, PRECACHE_URLS_MARKER, 'const PRECACHE_URLS = ["<precache>"];', "precache");
  digest.update(`service-worker-template\t${createHash("sha256").update(templateWithPrecacheMarker).digest("hex")}\t${Buffer.byteLength(templateWithPrecacheMarker)}\n`);
  const buildId = digest.digest("hex").slice(0, 16);
  const precacheUrls = ["./", ...files.map((file) => `./${file.path}`)];
  const stamped = stampServiceWorkerSource(serviceWorkerSource, buildId, precacheUrls);
  writeFileAtomically(workerPath, stamped);
  return { buildId, precacheCount: precacheUrls.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const { buildId, precacheCount } = stampServiceWorkerFile(distRoot, serviceWorkerPath);
  console.log(`SERVICE_WORKER_STAMP_PASS cache=omnevum-shell-${buildId} precache=${precacheCount}`);
}
