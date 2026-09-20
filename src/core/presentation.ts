export type PresentationTheme = "light" | "dark";
export type PresentationFamily = "alpha" | "beta" | "gamma";
export type PresentationLocale = "en-CA" | "fr-CA" | "ar";
export type PresentationDensity = "comfortable" | "compact";
export type PresentationTypeface = "system" | "serif" | "mono";
export type PresentationIconography = "labels" | "glyphs";
export type PresentationAccessibilityProfile = "standard" | "low-vision" | "motor-large-target" | "low-cognitive-load" | "custom";
export type PresentationTextScale = 1 | 1.25 | 1.5 | 2;
export type PresentationTargetSize = "standard" | "large";
export const PRESENTATION_LENS_IDS = ["direction", "people", "self", "resources", "work", "environment", "knowledge", "change"] as const;
export type PresentationLensId = typeof PRESENTATION_LENS_IDS[number];

export interface PresentationAccessibilitySettings {
  profile: PresentationAccessibilityProfile;
  textScale: PresentationTextScale;
  targetSize: PresentationTargetSize;
  reducedMotion: boolean;
}

export const PRESENTATION_PROFILE_FORMAT = "OMNEVUM_PRESENTATION_PROFILE" as const;
export const PRESENTATION_PROFILE_VERSION = 1 as const;
export const MAX_PRESENTATION_PROFILE_JSON_BYTES = 256 * 1024;

export const PRESENTATION_SECTION_IDS = [
  "home-summary", "capture", "acquire", "track", "domains", "search", "assistant", "spaces", "compose", "review",
  "relate", "knowledge", "sharing", "sync", "focus", "reminders", "records", "recovery", "presentation"
] as const;
export type PresentationSectionId = typeof PRESENTATION_SECTION_IDS[number];

export const PRESENTATION_HOME_WIDGET_IDS = ["summary", "insights", "attention"] as const;
export type PresentationHomeWidgetId = typeof PRESENTATION_HOME_WIDGET_IDS[number];

export interface PresentationProfile {
  schemaVersion: 1;
  productName: string;
  family: PresentationFamily;
  tagline: string;
  theme: PresentationTheme;
  locale: PresentationLocale;
  density: PresentationDensity;
  typeface: PresentationTypeface;
  iconography: PresentationIconography;
  accessibility: PresentationAccessibilitySettings;
  labels: { home: string; capture: string; records: string };
  navigation: { visible: PresentationSectionId[]; order: PresentationSectionId[] };
  lensPins: PresentationLensId[];
  activeLens: PresentationLensId;
  homeWidgets: PresentationHomeWidgetId[];
}

export interface PresentationProfileDocument {
  format: typeof PRESENTATION_PROFILE_FORMAT;
  version: typeof PRESENTATION_PROFILE_VERSION;
  exportedAt: string;
  profile: PresentationProfile;
}

const DEFAULT_SECTION_ORDER: PresentationSectionId[] = [...PRESENTATION_SECTION_IDS];
const DEFAULT_VISIBLE_SECTIONS: PresentationSectionId[] = ["home-summary", "capture", "search", "assistant", "review", "records", "recovery", "presentation"];
const DEFAULT_LENS_PINS: PresentationLensId[] = ["direction", "people", "self", "resources"];
const DEFAULT_HOME_WIDGETS: PresentationHomeWidgetId[] = [...PRESENTATION_HOME_WIDGET_IDS];

export const DEFAULT_ACCESSIBILITY: PresentationAccessibilitySettings = {
  profile: "standard",
  textScale: 1,
  targetSize: "standard",
  reducedMotion: false
};

const ACCESSIBILITY_PRESETS: Record<Exclude<PresentationAccessibilityProfile, "custom">, PresentationAccessibilitySettings> = {
  standard: { ...DEFAULT_ACCESSIBILITY },
  "low-vision": { profile: "low-vision", textScale: 1.5, targetSize: "large", reducedMotion: false },
  "motor-large-target": { profile: "motor-large-target", textScale: 1.25, targetSize: "large", reducedMotion: false },
  "low-cognitive-load": { profile: "low-cognitive-load", textScale: 1.25, targetSize: "large", reducedMotion: true }
};

export function accessibilityPreset(profile: Exclude<PresentationAccessibilityProfile, "custom">): PresentationAccessibilitySettings {
  return { ...ACCESSIBILITY_PRESETS[profile] };
}

export const DEFAULT_PRESENTATION: PresentationProfile = {
  schemaVersion: 1,
  productName: "Omnevum",
  family: "gamma",
  tagline: "",
  theme: "light",
  locale: "en-CA",
  density: "compact",
  typeface: "system",
  iconography: "labels",
  accessibility: { ...DEFAULT_ACCESSIBILITY },
  labels: { home: "", capture: "", records: "" },
  navigation: { visible: [...DEFAULT_VISIBLE_SECTIONS], order: [...DEFAULT_SECTION_ORDER] },
  lensPins: [...DEFAULT_LENS_PINS],
  activeLens: "direction",
  homeWidgets: [...DEFAULT_HOME_WIDGETS]
};

export function shouldAutoOpenHomeWidget(density: PresentationDensity, hasContent: boolean, explicitMode = false): boolean {
  return explicitMode || (density !== "compact" && hasContent);
}

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

function parseAccessibility(value: unknown): PresentationAccessibilitySettings {
  if (typeof value !== "object" || value === null) return { ...DEFAULT_ACCESSIBILITY };
  const candidate = value as Record<string, unknown>;
  const profile = candidate.profile === "low-vision" || candidate.profile === "motor-large-target" || candidate.profile === "low-cognitive-load" || candidate.profile === "custom" ? candidate.profile : "standard";
  const textScale = candidate.textScale === 1.25 || candidate.textScale === 1.5 || candidate.textScale === 2 ? candidate.textScale : 1;
  const targetSize = candidate.targetSize === "large" ? "large" : "standard";
  return { profile, textScale, targetSize, reducedMotion: candidate.reducedMotion === true };
}

export function parsePresentationProfile(value: unknown): PresentationProfile {
  if (typeof value !== "object" || value === null) return structuredClone(DEFAULT_PRESENTATION);
  const candidate = value as Record<string, unknown>;
  const navigation = typeof candidate.navigation === "object" && candidate.navigation !== null ? candidate.navigation as Record<string, unknown> : {};
  const visible = orderedValues(navigation.visible, PRESENTATION_SECTION_IDS, DEFAULT_VISIBLE_SECTIONS);
  const lensPins = orderedValues(candidate.lensPins, PRESENTATION_LENS_IDS, DEFAULT_LENS_PINS).slice(0, 4);
  for (const requiredSection of ["assistant", "recovery", "presentation"] as const) {
    if (!visible.includes(requiredSection)) visible.push(requiredSection);
  }
  return {
    schemaVersion: 1,
    productName: boundedString(candidate.productName, 80) || DEFAULT_PRESENTATION.productName,
    family: candidate.family === "alpha" || candidate.family === "beta" ? candidate.family : "gamma",
    tagline: boundedString(candidate.tagline, 160),
    theme: candidate.theme === "dark" ? "dark" : "light",
    locale: candidate.locale === "fr-CA" || candidate.locale === "ar" ? candidate.locale : "en-CA",
    density: candidate.density === "comfortable" ? "comfortable" : DEFAULT_PRESENTATION.density,
    typeface: candidate.typeface === "serif" || candidate.typeface === "mono" ? candidate.typeface : "system",
    iconography: candidate.iconography === "glyphs" ? "glyphs" : "labels",
    accessibility: parseAccessibility(candidate.accessibility),
    labels: parseLabels(candidate.labels),
    navigation: {
      visible,
      order: completeOrder(navigation.order, PRESENTATION_SECTION_IDS, DEFAULT_SECTION_ORDER)
    },
    lensPins,
    activeLens: typeof candidate.activeLens === "string" && PRESENTATION_LENS_IDS.includes(candidate.activeLens as PresentationLensId) ? candidate.activeLens as PresentationLensId : DEFAULT_PRESENTATION.activeLens,
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
  if (candidate.schemaVersion !== 1 || !validBoundedString(candidate.productName, 80, true) || (candidate.family !== undefined && candidate.family !== "alpha" && candidate.family !== "beta" && candidate.family !== "gamma") || (candidate.theme !== "light" && candidate.theme !== "dark") || (candidate.locale !== "en-CA" && candidate.locale !== "fr-CA" && candidate.locale !== "ar")) return false;
  if (candidate.tagline !== undefined && !validBoundedString(candidate.tagline, 160)) return false;
  if (candidate.density !== undefined && candidate.density !== "comfortable" && candidate.density !== "compact") return false;
  if (candidate.typeface !== undefined && candidate.typeface !== "system" && candidate.typeface !== "serif" && candidate.typeface !== "mono") return false;
  if (candidate.iconography !== undefined && candidate.iconography !== "labels" && candidate.iconography !== "glyphs") return false;
  if (candidate.accessibility !== undefined) {
    if (typeof candidate.accessibility !== "object" || candidate.accessibility === null) return false;
    const accessibility = candidate.accessibility as Record<string, unknown>;
    if (!["standard", "low-vision", "motor-large-target", "low-cognitive-load", "custom"].includes(String(accessibility.profile))) return false;
    if (![1, 1.25, 1.5, 2].includes(accessibility.textScale as number) || (accessibility.targetSize !== "standard" && accessibility.targetSize !== "large") || typeof accessibility.reducedMotion !== "boolean") return false;
  }
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
  if (candidate.lensPins !== undefined) {
    if (!validList(candidate.lensPins, PRESENTATION_LENS_IDS)) return false;
    if ((candidate.lensPins as unknown[]).length > 4) return false;
  }
  if (candidate.activeLens !== undefined && (typeof candidate.activeLens !== "string" || !PRESENTATION_LENS_IDS.includes(candidate.activeLens as PresentationLensId))) return false;
  return candidate.homeWidgets === undefined || validList(candidate.homeWidgets, PRESENTATION_HOME_WIDGET_IDS);
}

export function resolvePresentationProfile(value: unknown, safeMode: boolean): PresentationResolution {
  return {
    profile: safeMode ? structuredClone(DEFAULT_PRESENTATION) : parsePresentationProfile(value),
    safeMode,
    storedProfileValid: value === undefined || isPresentationProfile(value)
  };
}

export function makePresentationProfileDocument(profile: PresentationProfile, exportedAt = new Date().toISOString()): PresentationProfileDocument {
  if (!isPresentationProfile(profile)) throw new Error("Presentation profile is invalid");
  return {
    format: PRESENTATION_PROFILE_FORMAT,
    version: PRESENTATION_PROFILE_VERSION,
    exportedAt,
    profile: structuredClone(profile)
  };
}

export function parsePresentationProfileDocument(value: unknown): PresentationProfile {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Presentation profile document is invalid");
  const candidate = value as Record<string, unknown>;
  if (candidate.format !== PRESENTATION_PROFILE_FORMAT || candidate.version !== PRESENTATION_PROFILE_VERSION || typeof candidate.exportedAt !== "string" || !Number.isFinite(Date.parse(candidate.exportedAt))) {
    throw new Error("Presentation profile document is invalid");
  }
  if (!isPresentationProfile(candidate.profile)) throw new Error("Presentation profile payload is invalid");
  return parsePresentationProfile(candidate.profile);
}
