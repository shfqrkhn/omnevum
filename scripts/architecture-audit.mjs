import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const sourceRoot = join(root, "src");
const publicRoot = join(root, "public");
const failures = [];

const files = [];
const walk = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else files.push(path);
  }
};
walk(sourceRoot);
walk(publicRoot);

const sourceText = files.filter((path) => /\.(?:ts|tsx|js|mjs)$/.test(path)).map((path) => ({ path, text: readFileSync(path, "utf8") }));
const productionSource = sourceText.filter(({ path }) => !/\.test\.(?:ts|tsx|js|mjs)$/.test(path));
const indexedDbOwners = productionSource.filter(({ text }) => /(?:indexedDB|databaseFactory)\.open\s*\(/.test(text)).map(({ path }) => path);
if (indexedDbOwners.length !== 1 || !indexedDbOwners[0].endsWith("src\\core\\storage.ts")) failures.push(`IndexedDB owner files=${indexedDbOwners.join(",") || "none"}`);
const testIndexedDbFixtures = sourceText.filter(({ path, text }) => /\.test\.(?:ts|tsx|js|mjs)$/.test(path) && /indexedDB\.open\s*\(/.test(text)).map(({ path }) => path);
if (testIndexedDbFixtures.some((path) => !path.endsWith("src\\core\\storage.test.ts"))) failures.push(`unapproved IndexedDB test fixtures=${testIndexedDbFixtures.join(",")}`);
const directLocalStorage = productionSource.filter(({ text }) => /\blocalStorage\b/.test(text)).map(({ path }) => path);
if (directLocalStorage.length > 0) failures.push(`direct localStorage use=${directLocalStorage.join(",")}`);
const serviceWorkers = readdirSync(publicRoot).filter((name) => /^sw(?:\.|$)|service-worker/i.test(name));
if (serviceWorkers.length !== 1 || serviceWorkers[0] !== "sw.js") failures.push(`service-worker files=${serviceWorkers.join(",") || "none"}`);
const directMutations = productionSource.filter(({ path, text }) => !path.endsWith("src\\core\\storage.ts") && /\.objectStore\s*\(/.test(text)).map(({ path }) => path);
if (directMutations.length > 0) failures.push(`storage objectStore access outside canonical owner=${directMutations.join(",")}`);

if (failures.length > 0) {
  console.error(`ARCHITECTURE_AUDIT_FAIL\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log("ARCHITECTURE_AUDIT_PASS");
}
