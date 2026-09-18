import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const dist = join(root, "dist");
const failures = [];
if (!existsSync(dist)) failures.push("missing dist");
if (failures.length === 0) {
  const index = readFileSync(join(dist, "index.html"), "utf8");
  const manifest = readFileSync(join(dist, "manifest.webmanifest"), "utf8");
  const serviceWorker = readFileSync(join(dist, "sw.js"), "utf8");
  if (!index.includes("./assets/") || !index.includes("./manifest.webmanifest")) failures.push("index is not relative-base deployable");
  if (index.includes("/src/") || /<(?:script|link)[^>]+(?:src|href)=['\"]https?:/i.test(index)) failures.push("index contains development or remote runtime asset");
  if (JSON.parse(manifest).start_url !== "./") failures.push("manifest start_url is not relative");
  if ((serviceWorker.match(/self\.addEventListener\("fetch"/g) ?? []).length !== 1) failures.push("service worker fetch owner is not unique");
  if (!/const CACHE_PREFIX = "omnevum-shell-";/.test(serviceWorker) || !/const CACHE_NAME = "omnevum-shell-[a-f0-9]{16}";/.test(serviceWorker)) failures.push("service worker is missing the stamped owned cache identity");
  const precacheMatch = serviceWorker.match(/const PRECACHE_URLS = (\[[^\n]+\]);/);
  if (!precacheMatch) failures.push("service worker is missing the stamped precache manifest");
  else {
    try {
      const precache = JSON.parse(precacheMatch[1]);
      if (!Array.isArray(precache) || precache[0] !== "./") failures.push("service worker precache manifest is invalid");
      const actualFiles = readdirSync(dist, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? readdirSync(join(dist, entry.name)).map((name) => `./${entry.name}/${name}`) : [`./${entry.name}`]).filter((path) => path !== "./sw.js").sort();
      const precachedFiles = precache.filter((path) => path !== "./").sort();
      if (JSON.stringify(actualFiles) !== JSON.stringify(precachedFiles)) failures.push("service worker precache manifest does not cover the built artifact");
    } catch {
      failures.push("service worker precache manifest is not JSON");
    }
  }
  const files = readdirSync(dist, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? readdirSync(join(dist, entry.name)) : [entry.name]);
  if (!files.some((name) => name.endsWith(".js"))) failures.push("missing built JavaScript");
}
if (failures.length > 0) {
  console.error(`STATIC_AUDIT_FAIL\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log("STATIC_AUDIT_PASS");
}
