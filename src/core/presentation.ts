export type PresentationTheme = "light" | "dark";
export type PresentationLocale = "en-CA" | "fr-CA";
export type PresentationDensity = "comfortable" | "compact";
export type PresentationTypeface = "system" | "serif" | "mono";
export type PresentationIconography = "labels" | "glyphs";

export const PRESENTATION_SECTION_IDS = [
  "home-summary", "capture", "acquire", "track", "domains", "search", "spaces", "compose", "review",
  "relate", "knowledge", "sharing", "sync", "focus", "reminders", "records", "recovery", "presentation"
] as const;
export type PresentationSectionId = typeof PRESENTATION_SECTION_IDS[number];

export const PRESENTATION_HOME_WIDGET_IDS = ["summary", "insights", "attention"] as const;
export type PresentationHomeWidgetId = typeof PRESENTATION_HOME_WIDGET_IDS[number];

export interface PresentationProfile {
  schemaVersion: 1;
  productName: string;
  tagline: string;
  theme: PresentationTheme;
  locale: PresentationLocale;
  density: PresentationDensity;
  typeface: PresentationTypeface;
  iconography: PresentationIconography;
  labels: { home: string; capture: string; records: string };
  navigation: { visible: PresentationSectionId[]; order: PresentationSectionId[] };
  homeWidgets: PresentationHomeWidgetId[];
}

const DEFAULT_SECTION_ORDER: PresentationSectionId[] = [...PRESENTATION_SECTION_IDS];
const DEFAULT_HOME_WIDGETS: PresentationHomeWidgetId[] = [...PRESENTATION_HOME_WIDGET_IDS];

export const DEFAULT_PRESENTATION: PresentationProfile = {
  schemaVersion: 1,
  productName: "Omnevum",
  tagline: "",
  theme: "light",
  locale: "en-CA",
  density: "comfortable",
  typeface: "system",
  iconography: "labels",
  labels: { home: "", capture: "", records: "" },
  navigation: { visible: [...DEFAULT_SECTION_ORDER], order: [...DEFAULT_SECTION_ORDER] },
  homeWidgets: [...DEFAULT_HOME_WIDGETS]
};

export interface PresentationResolution {
  profile: PresentationProfile;
  safeMode: boolean;
  storedProfileValid: boolean;
}

function boundedString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function orderedValues<T extends string>(value: unknown, allowed: readonly T[], fallback: readonly T[]): T[] {
  if (!Array.isArray(value)) return [...fallback];
  const allowedSet = new Set(allowed);
  const selected = value.filter((entry): entry is T => typeof entry === "string" && allowedSet.has(entry as T));
  const unique = [...new Set(selected)];
  return unique.length > 0 ? unique : [...fallback];
}

function completeOrder<T extends string>(value: unknown, allowed: readonly T[], fallback: readonly T[]): T[] {
  const ordered = orderedValues(value, allowed, fallback);
  return [...ordered, ...fallback.filter((entry) => !ordered.includes(entry))];
}

function parseLabels(value: unknown): PresentationProfile["labels"] {
  if (typeof value !== "object" || value === null) return { ...DEFAULT_PRESENTATION.labels };
  const candidate = value as Record<string, unknown>;
  return { home: boundedString(candidate.home, 40), capture: boundedString(candidate.capture, 40), records: boundedString(candidate.records, 40) };
}

export function parsePresentationProfile(value: unknown): PresentationProfile {
  if (typeof value !== "object" || value === null) return structuredClone(DEFAULT_PRESENTATION);
  const candidate = value as Record<string, unknown>;
  const navigation = typeof candidate.navigation === "object" && candidate.navigation !== null ? candidate.navigation as Record<string, unknown> : {};
  const visible = orderedValues(navigation.visible, PRESENTATION_SECTION_IDS, DEFAULT_SECTION_ORDER);
  for (const requiredSection of ["recovery", "presentation"] as const) {
    if (!visible.includes(requiredSection)) visible.push(requiredSection);
  }
  return {
    schemaVersion: 1,
    productName: boundedString(candidate.productName, 80) || DEFAULT_PRESENTATION.productName,
    tagline: boundedString(candidate.tagline, 160),
    theme: candidate.theme === "dark" ? "dark" : "light",
    locale: candidate.locale === "fr-CA" ? "fr-CA" : "en-CA",
    density: candidate.density === "compact" ? "compact" : "comfortable",
    typeface: candidate.typeface === "serif" || candidate.typeface === "mono" ? candidate.typeface : "system",
    iconography: candidate.iconography === "glyphs" ? "glyphs" : "labels",
    labels: parseLabels(candidate.labels),
    navigation: {
      visible,
      order: completeOrder(navigation.order, PRESENTATION_SECTION_IDS, DEFAULT_SECTION_ORDER)
    },
    homeWidgets: orderedValues(candidate.homeWidgets, PRESENTATION_HOME_WIDGET_IDS, DEFAULT_HOME_WIDGETS)
  };
}

function validBoundedString(value: unknown, maxLength: number, required = false): boolean {
  return typeof value === "string" && value.trim().length <= maxLength && (!required || value.trim().length > 0);
}

function validList<T extends string>(value: unknown, allowed: readonly T[]): boolean {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string" && allowed.includes(entry as T)) && new Set(value).size === value.length;
}

export function isPresentationProfile(value: unknown): value is PresentationProfile {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== 1 || !validBoundedString(candidate.productName, 80, true) || (candidate.theme !== "light" && candidate.theme !== "dark") || (candidate.locale !== "en-CA" && candidate.locale !== "fr-CA")) return false;
  if (candidate.tagline !== undefined && !validBoundedString(candidate.tagline, 160)) return false;
  if (candidate.density !== undefined && candidate.density !== "comfortable" && candidate.density !== "compact") return false;
  if (candidate.typeface !== undefined && candidate.typeface !== "system" && candidate.typeface !== "serif" && candidate.typeface !== "mono") return false;
  if (candidate.iconography !== undefined && candidate.iconography !== "labels" && candidate.iconography !== "glyphs") return false;
  if (candidate.labels !== undefined) {
    if (typeof candidate.labels !== "object" || candidate.labels === null) return false;
    const labels = candidate.labels as Record<string, unknown>;
    if (!validBoundedString(labels.home, 40) || !validBoundedString(labels.capture, 40) || !validBoundedString(labels.records, 40)) return false;
  }
  if (candidate.navigation !== undefined) {
    if (typeof candidate.navigation !== "object" || candidate.navigation === null) return false;
    const navigation = candidate.navigation as Record<string, unknown>;
    if (!validList(navigation.visible, PRESENTATION_SECTION_IDS) || !validList(navigation.order, PRESENTATION_SECTION_IDS)) return false;
  }
  return candidate.homeWidgets === undefined || validList(candidate.homeWidgets, PRESENTATION_HOME_WIDGET_IDS);
}

export function resolvePresentationProfile(value: unknown, safeMode: boolean): PresentationResolution {
  return {
    profile: safeMode ? structuredClone(DEFAULT_PRESENTATION) : parsePresentationProfile(value),
    safeMode,
    storedProfileValid: value === undefined || isPresentationProfile(value)
  };
}
