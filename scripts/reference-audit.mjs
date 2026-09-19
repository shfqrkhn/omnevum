import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const docsRoot = join(root, "docs");
const failures = [];
const markdownAnchorCache = new Map();

const walk = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? walk(path) : [path];
});

const relativePath = (value) => value.replaceAll("\\", "/").replace(/^\.\//, "");
const markdownAnchors = (candidate) => {
  if (markdownAnchorCache.has(candidate)) return markdownAnchorCache.get(candidate);
  const anchors = new Set();
  const counts = new Map();
  const text = readFileSync(join(root, candidate), "utf8");
  for (const match of text.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const heading = match[1].replace(/<[^>]+>/g, "").trim().toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
    const count = counts.get(heading) ?? 0;
    counts.set(heading, count + 1);
    anchors.add(count === 0 ? heading : `${heading}-${count}`);
  }
  markdownAnchorCache.set(candidate, anchors);
  return anchors;
};
const checkReference = (value, fragment, source) => {
  const candidate = relativePath(value);
  if (!/^(?:docs|scripts|src|public)\//.test(candidate)) return;
  if (!existsSync(join(root, candidate))) {
    failures.push(`${source} references missing ${candidate}`);
    return;
  }
  if (fragment && candidate.toLowerCase().endsWith(".md")) {
    let decoded = fragment;
    try { decoded = decodeURIComponent(fragment); } catch { /* preserve the raw fragment for the failure */ }
    if (!markdownAnchors(candidate).has(decoded.toLowerCase())) failures.push(`${source} references missing anchor ${candidate}#${fragment}`);
  }
};

const visitJson = (value, source) => {
  if (typeof value === "string") {
    const compatibilityOnly = /\.historicalSources\[\d+\]\.path$|\.relocations\[\d+\]\.from$|\.retiredPaths\[\d+\]$/.test(source);
    if (!compatibilityOnly) {
      for (const match of value.matchAll(/(?:^|[^A-Za-z0-9_.-])((?:docs|scripts|src|public)\/[A-Za-z0-9_.\/-]+\.[A-Za-z0-9]+)(?:#([A-Za-z0-9_.~-]+))?/g)) checkReference(match[1], match[2], source);
    }
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
  for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const [target, fragment] = match[1].split("#", 2);
    checkReference(target, fragment, `${relative(root, path).replaceAll("\\", "/")} markdown link`);
  }
}

if (failures.length > 0) {
  console.error(`REFERENCE_AUDIT_FAIL\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log("REFERENCE_AUDIT_PASS");
}
