import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const docsRoot = join(root, "docs");
const failures = [];

const walk = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? walk(path) : [path];
});

const relativePath = (value) => value.replaceAll("\\", "/").replace(/^\.\//, "");
const checkPath = (value, source) => {
  const candidate = relativePath(value);
  if (!/^(?:docs|scripts|src|public)\//.test(candidate)) return;
  if (!existsSync(join(root, candidate))) failures.push(`${source} references missing ${candidate}`);
};

const visitJson = (value, source) => {
  if (typeof value === "string") {
    for (const match of value.matchAll(/(?:^|[^A-Za-z0-9_.-])((?:docs|scripts|src|public)\/[A-Za-z0-9_.\/-]+)/g)) checkPath(match[1], source);
  }
  else if (Array.isArray(value)) value.forEach((item, index) => visitJson(item, `${source}[${index}]`));
  else if (typeof value === "object" && value !== null) Object.entries(value).forEach(([key, child]) => visitJson(child, `${source}.${key}`));
};

for (const path of walk(docsRoot).filter((candidate) => candidate.endsWith(".json"))) {
  try {
    visitJson(JSON.parse(readFileSync(path, "utf8")), relative(root, path).replaceAll("\\", "/"));
  } catch (error) {
    failures.push(`invalid JSON ${relative(root, path).replaceAll("\\", "/")}: ${error instanceof Error ? error.message : "parse failure"}`);
  }
}

for (const path of walk(docsRoot).filter((candidate) => candidate.endsWith(".md"))) {
  const text = readFileSync(path, "utf8");
  for (const match of text.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) checkPath(match[1], `${relative(root, path).replaceAll("\\", "/")} markdown link`);
}

if (failures.length > 0) {
  console.error(`REFERENCE_AUDIT_FAIL\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log("REFERENCE_AUDIT_PASS");
}
