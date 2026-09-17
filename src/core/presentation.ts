export type PresentationTheme = "light" | "dark";
export type PresentationLocale = "en-CA" | "fr-CA";

export interface PresentationProfile {
  schemaVersion: 1;
  productName: string;
  theme: PresentationTheme;
  locale: PresentationLocale;
}

export const DEFAULT_PRESENTATION: PresentationProfile = {
  schemaVersion: 1,
  productName: "Omnevum",
  theme: "light",
  locale: "en-CA"
};

export function parsePresentationProfile(value: unknown): PresentationProfile {
  if (typeof value !== "object" || value === null) return { ...DEFAULT_PRESENTATION };
  const candidate = value as Record<string, unknown>;
  const productName = typeof candidate.productName === "string" ? candidate.productName.trim().slice(0, 80) : "";
  return {
    schemaVersion: 1,
    productName: productName || DEFAULT_PRESENTATION.productName,
    theme: candidate.theme === "dark" ? "dark" : "light",
    locale: candidate.locale === "fr-CA" ? "fr-CA" : "en-CA"
  };
}
