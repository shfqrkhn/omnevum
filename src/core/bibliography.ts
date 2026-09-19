export const MAX_BIBLIOGRAPHY_BYTES = 2 * 1024 * 1024;
export const MAX_BIBLIOGRAPHY_ENTRIES = 10_000;

export const BIBLIOGRAPHY_FORMATS = ["BIBTEX", "RIS", "CSL_JSON"] as const;
export type BibliographyFormat = (typeof BIBLIOGRAPHY_FORMATS)[number];
export const BIBLIOGRAPHY_STYLES = ["APA", "CHICAGO", "IEEE"] as const;
export type BibliographyStyle = (typeof BIBLIOGRAPHY_STYLES)[number];

export interface BibliographyAuthor {
  family: string;
  given?: string;
}

export interface BibliographyEntry {
  id: string;
  title: string;
  authors: BibliographyAuthor[];
  issuedYear?: number;
  containerTitle?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  url?: string;
  sourceId: string;
  sourceFormat: BibliographyFormat;
}

export interface BibliographyImportResult {
  entries: BibliographyEntry[];
  warnings: string[];
  sourceId: string;
  sourceFormat: BibliographyFormat;
}

export interface BibliographyLink {
  entryId: string;
  sourceId: string;
  artifactRecordId: string;
  annotation: string;
}

export interface DerivedBibliographyRow {
  entryId: string;
  sourceId: string;
  artifactRecordId?: string;
  citation: string;
  bibliography: string;
}

export interface DerivedBibliographyProjection {
  kind: "DERIVED_BIBLIOGRAPHY";
  style: BibliographyStyle;
  rows: DerivedBibliographyRow[];
  links: BibliographyLink[];
}

export function parseBibliography(text: string, format: BibliographyFormat, sourceId: string): BibliographyImportResult {
  if (!BIBLIOGRAPHY_FORMATS.includes(format) || !sourceId.trim() || sourceId.length > 240) throw new Error("Bibliography source identity or format is invalid");
  if (new TextEncoder().encode(text).byteLength > MAX_BIBLIOGRAPHY_BYTES) throw new Error("Bibliography input exceeds the bounded 2 MiB limit");
  const parsed = format === "BIBTEX" ? parseBibtex(text, sourceId) : format === "RIS" ? parseRis(text, sourceId) : parseCslJson(text, sourceId);
  if (parsed.entries.length === 0) throw new Error("Bibliography input contains no usable entries");
  return { ...parsed, sourceId, sourceFormat: format };
}

export function linkBibliographyEntry(entry: BibliographyEntry, artifactRecordId: string, annotation: string): BibliographyLink {
  if (!entry.id.trim() || !entry.sourceId.trim() || !artifactRecordId.trim() || !annotation.trim()) throw new Error("Bibliography link requires entry, source, Artifact, and annotation identities");
  return { entryId: entry.id, sourceId: entry.sourceId, artifactRecordId: artifactRecordId.trim(), annotation: annotation.trim().slice(0, 2_000) };
}

export function projectBibliography(entries: readonly BibliographyEntry[], style: BibliographyStyle, links: readonly BibliographyLink[] = []): DerivedBibliographyProjection {
  if (!BIBLIOGRAPHY_STYLES.includes(style)) throw new Error("Bibliography style is unsupported");
  const byEntryId = new Map(entries.map((entry) => [entry.id, entry]));
  if (links.some((link) => !byEntryId.has(link.entryId))) throw new Error("Bibliography link references an unknown entry");
  const linkByEntry = new Map(links.map((link) => [link.entryId, link]));
  return {
    kind: "DERIVED_BIBLIOGRAPHY",
    style,
    rows: entries.map((entry, index) => {
      const link = linkByEntry.get(entry.id);
      return {
        entryId: entry.id,
        sourceId: entry.sourceId,
        ...(link ? { artifactRecordId: link.artifactRecordId } : {}),
        citation: formatCitation(entry, style, index + 1),
        bibliography: formatBibliography(entry, style, index + 1)
      };
    }),
    links: links.map((link) => ({ ...link }))
  };
}

export function formatCitation(entry: BibliographyEntry, style: BibliographyStyle, ordinal: number): string {
  const author = entry.authors[0]?.family || "Unknown author";
  const year = entry.issuedYear?.toString() ?? "n.d.";
  if (style === "IEEE") return `[${ordinal}]`;
  if (style === "CHICAGO") return `(${author} ${year})`;
  return `(${author}, ${year})`;
}

export function formatBibliography(entry: BibliographyEntry, style: BibliographyStyle, ordinal: number): string {
  const authors = formatAuthors(entry.authors, style);
  const year = entry.issuedYear?.toString() ?? "n.d.";
  const container = entry.containerTitle ? ` ${entry.containerTitle}.` : "";
  const locator = entry.doi ? ` https://doi.org/${entry.doi}` : entry.url ? ` ${entry.url}` : "";
  if (style === "IEEE") return `[${ordinal}] ${authors}, \"${entry.title},\"${container} ${year}.${locator}`.replace(/\s+/gu, " ").trim();
  if (style === "CHICAGO") return `${authors}. \"${entry.title}.\"${container} (${year}).${locator}`.replace(/\s+/gu, " ").trim();
  return `${authors} (${year}). ${entry.title}.${container}${locator}`.replace(/\s+/gu, " ").trim();
}

function parseBibtex(text: string, sourceId: string): { entries: BibliographyEntry[]; warnings: string[] } {
  const entries: BibliographyEntry[] = [];
  const warnings: string[] = [];
  const marker = /@([a-z]+)\s*[{(]/giu;
  while (marker.exec(text) !== null && entries.length < MAX_BIBLIOGRAPHY_ENTRIES) {
    const closing = findEntryEnd(text, marker.lastIndex - 1);
    if (closing < 0) { warnings.push("An unterminated BibTeX entry was ignored"); break; }
    const body = text.slice(marker.lastIndex, closing).trim();
    const comma = topLevelIndex(body, ",");
    if (comma < 0) { warnings.push("A BibTeX entry without an identity was ignored"); marker.lastIndex = closing + 1; continue; }
    const id = cleanValue(body.slice(0, comma));
    const fields = parseKeyValueFields(body.slice(comma + 1));
    const entry = normalizeEntry({ id, title: fields.get("title"), author: fields.get("author"), year: fields.get("year"), containerTitle: fields.get("journal") ?? fields.get("booktitle"), volume: fields.get("volume"), issue: fields.get("number"), pages: fields.get("pages"), doi: fields.get("doi"), url: fields.get("url") }, sourceId, "BIBTEX", entries.length + 1);
    if (entry) entries.push(entry); else warnings.push(`BibTeX entry ${id || entries.length + 1} has no usable title and was ignored`);
    marker.lastIndex = closing + 1;
  }
  if (entries.length === MAX_BIBLIOGRAPHY_ENTRIES) warnings.push(`Only the first ${MAX_BIBLIOGRAPHY_ENTRIES} bibliography entries were imported`);
  return { entries, warnings };
}

function parseRis(text: string, sourceId: string): { entries: BibliographyEntry[]; warnings: string[] } {
  const entries: BibliographyEntry[] = [];
  const warnings: string[] = [];
  let fields = new Map<string, string[]>();
  const flush = (): void => {
    if (fields.size === 0) return;
    const value = (key: string) => fields.get(key)?.join("; ");
    const entry = normalizeEntry({ id: value("ID"), title: value("TI") ?? value("T1"), author: value("AU") ?? value("A1"), year: value("PY") ?? value("Y1"), containerTitle: value("JO") ?? value("JF") ?? value("T2"), volume: value("VL"), issue: value("IS"), pages: value("SP") && value("EP") ? `${value("SP")}-${value("EP")}` : value("SP"), doi: value("DO"), url: value("UR") }, sourceId, "RIS", entries.length + 1);
    if (entry) entries.push(entry); else warnings.push(`RIS entry ${entries.length + 1} has no usable title and was ignored`);
    fields = new Map();
  };
  for (const line of text.split(/\r?\n/u)) {
    const match = /^([A-Z0-9]{2})\s+-\s+(.*)$/u.exec(line.trim());
    if (!match) continue;
    const key = match[1];
    if (!key) continue;
    if (key === "ER") flush();
    else fields.set(key, [...(fields.get(key) ?? []), cleanValue(match[2] ?? "")]);
  }
  flush();
  return { entries, warnings };
}

function parseCslJson(text: string, sourceId: string): { entries: BibliographyEntry[]; warnings: string[] } {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error("CSL-JSON bibliography is not valid JSON"); }
  const values = Array.isArray(parsed) ? parsed : isRecord(parsed) && Array.isArray(parsed.items) ? parsed.items : [parsed];
  const entries: BibliographyEntry[] = [];
  const warnings: string[] = [];
  for (const value of values.slice(0, MAX_BIBLIOGRAPHY_ENTRIES)) {
    const item = isRecord(value) ? value : {};
    const authors = Array.isArray(item.author) ? item.author.map((author) => isRecord(author) ? ({ family: stringValue(author.family), ...(stringValue(author.given) ? { given: stringValue(author.given) } : {}) }) : undefined).filter((author): author is BibliographyAuthor => Boolean(author?.family)) : [];
    const issuedYear = isRecord(item.issued) && Array.isArray(item.issued["date-parts"]) && Array.isArray(item.issued["date-parts"][0]) && typeof item.issued["date-parts"][0][0] === "number" ? item.issued["date-parts"][0][0] : undefined;
    const entry = normalizeEntry({ id: stringValue(item.id), title: stringValue(item.title), author: authors, year: issuedYear?.toString(), containerTitle: stringValue(item["container-title"]), volume: stringValue(item.volume), issue: stringValue(item.issue), pages: stringValue(item.page), doi: stringValue(item.DOI), url: stringValue(item.URL) }, sourceId, "CSL_JSON", entries.length + 1);
    if (entry) entries.push(entry); else warnings.push(`CSL-JSON item ${entries.length + 1} has no usable title and was ignored`);
  }
  if (values.length > MAX_BIBLIOGRAPHY_ENTRIES) warnings.push(`Only the first ${MAX_BIBLIOGRAPHY_ENTRIES} bibliography entries were imported`);
  return { entries, warnings };
}

function normalizeEntry(input: { id?: string | undefined; title?: string | undefined; author?: string | BibliographyAuthor[] | undefined; year?: string | undefined; containerTitle?: string | undefined; volume?: string | undefined; issue?: string | undefined; pages?: string | undefined; doi?: string | undefined; url?: string | undefined }, sourceId: string, sourceFormat: BibliographyFormat, sequence: number): BibliographyEntry | undefined {
  const title = cleanValue(input.title ?? "");
  if (!title) return undefined;
  const authors = Array.isArray(input.author) ? input.author : parseAuthors(input.author ?? "");
  const yearNumber = input.year ? Number.parseInt(input.year.match(/\b(\d{4})\b/u)?.[1] ?? "", 10) : Number.NaN;
  const id = cleanValue(input.id ?? "") || `${sourceId}:${sequence}`;
  return {
    id: id.slice(0, 240),
    title: title.slice(0, 2_000),
    authors: authors.slice(0, 100),
    ...(Number.isSafeInteger(yearNumber) && yearNumber >= 0 && yearNumber <= 9999 ? { issuedYear: yearNumber } : {}),
    ...(optionalValue(input.containerTitle) ? { containerTitle: cleanValue(input.containerTitle!).slice(0, 500) } : {}),
    ...(optionalValue(input.volume) ? { volume: cleanValue(input.volume!).slice(0, 120) } : {}),
    ...(optionalValue(input.issue) ? { issue: cleanValue(input.issue!).slice(0, 120) } : {}),
    ...(optionalValue(input.pages) ? { pages: cleanValue(input.pages!).slice(0, 120) } : {}),
    ...(optionalValue(input.doi) ? { doi: cleanValue(input.doi!).replace(/^https?:\/\/doi.org\//iu, "").slice(0, 240) } : {}),
    ...(optionalValue(input.url) ? { url: cleanValue(input.url!).slice(0, 2_000) } : {}),
    sourceId,
    sourceFormat
  };
}

function parseAuthors(value: string): BibliographyAuthor[] {
  return value.split(/\s+and\s+/iu).map((author) => {
    const normalized = cleanValue(author);
    if (!normalized) return undefined;
    const comma = normalized.indexOf(",");
    if (comma >= 0) return { family: normalized.slice(0, comma).trim(), ...(normalized.slice(comma + 1).trim() ? { given: normalized.slice(comma + 1).trim() } : {}) };
    const words = normalized.split(/\s+/u);
    return { family: words.pop() ?? normalized, ...(words.length > 0 ? { given: words.join(" ") } : {}) };
  }).filter((author): author is BibliographyAuthor => Boolean(author?.family)).slice(0, 100);
}

function formatAuthors(authors: readonly BibliographyAuthor[], style: BibliographyStyle): string {
  if (authors.length === 0) return "Unknown author";
  const labels = authors.map((author) => style === "IEEE" ? `${author.given ? `${author.given} ` : ""}${author.family}` : `${author.family}${author.given ? `, ${author.given}` : ""}`);
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} & ${labels[1]}`;
  return `${labels.slice(0, 3).join(", ")}, et al.`;
}

function parseKeyValueFields(text: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const part of splitTopLevel(text, ",")) {
    const equals = topLevelIndex(part, "=");
    if (equals < 0) continue;
    result.set(cleanValue(part.slice(0, equals)).toLocaleLowerCase("en-CA"), cleanValue(part.slice(equals + 1)));
  }
  return result;
}

function splitTopLevel(text: string, delimiter: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "\"" && text[index - 1] !== "\\") quote = !quote;
    if (!quote && character === "{") depth += 1;
    if (!quote && character === "}") depth -= 1;
    if (!quote && depth === 0 && text.startsWith(delimiter, index)) { parts.push(text.slice(start, index)); start = index + delimiter.length; }
  }
  parts.push(text.slice(start));
  return parts;
}

function topLevelIndex(text: string, needle: string): number {
  return splitTopLevel(text, needle).length > 1 ? text.indexOf(needle) : -1;
}

function findEntryEnd(text: string, openingIndex: number): number {
  const opening = text[openingIndex];
  const closing = opening === "(" ? ")" : "}";
  let depth = 0;
  let quote = false;
  for (let index = openingIndex; index < text.length; index += 1) {
    const character = text[index];
    if (character === "\"" && text[index - 1] !== "\\") quote = !quote;
    if (!quote && character === opening) depth += 1;
    if (!quote && character === closing) { depth -= 1; if (depth === 0) return index; }
  }
  return -1;
}

function cleanValue(value: string): string {
  let result = value.trim();
  while ((result.startsWith("{") && result.endsWith("}") || result.startsWith("\"") && result.endsWith("\"")) && result.length >= 2) result = result.slice(1, -1).trim();
  return result.replace(/[{}]/gu, "").replace(/\s+/gu, " ").trim();
}

function optionalValue(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
