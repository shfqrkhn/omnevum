import { describe, expect, it } from "vitest";
import { accessibilityPreset, DEFAULT_PRESENTATION, isPresentationProfile, makePresentationProfileDocument, parsePresentationProfile, parsePresentationProfileDocument, resolvePresentationProfile } from "./presentation";
import { CanonicalStore } from "./storage";

describe("presentation profile", () => {
  it("falls back safely and bounds imported branding", () => {
    expect(parsePresentationProfile(null)).toEqual(DEFAULT_PRESENTATION);
    expect(parsePresentationProfile({ productName: "  JohnOS  ", theme: "dark", locale: "fr-FR" })).toMatchObject({
      schemaVersion: 1,
      productName: "JohnOS",
      family: "gamma",
      theme: "dark",
      locale: "en-CA",
      density: "comfortable",
      typeface: "system",
      iconography: "labels"
    });
  });

  it("supports the three persisted built-in presentation families", () => {
    expect(parsePresentationProfile({ productName: "Alpha", family: "alpha" })).toMatchObject({ family: "alpha" });
    expect(parsePresentationProfile({ productName: "Beta", family: "beta", theme: "dark" })).toMatchObject({ family: "beta", theme: "dark" });
    expect(parsePresentationProfile({ productName: "Gamma", family: "neon" })).toMatchObject({ family: "gamma" });
    expect(isPresentationProfile({ ...DEFAULT_PRESENTATION, family: "alpha" })).toBe(true);
    expect(isPresentationProfile({ ...DEFAULT_PRESENTATION, family: "neon" } as unknown)).toBe(false);
  });

  it("preserves eight equal-prominence lens identities and bounds pinned presentation state", () => {
    const profile = parsePresentationProfile({ ...DEFAULT_PRESENTATION, lensPins: ["knowledge", "change", "work", "environment", "people"], activeLens: "change" });
    expect(profile.lensPins).toEqual(["knowledge", "change", "work", "environment"]);
    expect(profile.activeLens).toBe("change");
    expect(isPresentationProfile({ ...DEFAULT_PRESENTATION, lensPins: ["direction", "people", "self", "resources", "work"] } as unknown)).toBe(false);
    expect(parsePresentationProfile({ productName: "Legacy" }).lensPins).toEqual(["direction", "people", "self", "resources"]);
  });

  it("supports named accessibility profiles with independently persisted settings", () => {
    expect(accessibilityPreset("low-vision")).toMatchObject({ profile: "low-vision", textScale: 1.5, targetSize: "large", reducedMotion: false });
    expect(parsePresentationProfile({ productName: "Accessible", accessibility: { profile: "motor-large-target", textScale: 2, targetSize: "large", reducedMotion: true } })).toMatchObject({ accessibility: { profile: "motor-large-target", textScale: 2, targetSize: "large", reducedMotion: true } });
    expect(parsePresentationProfile({ productName: "Custom", accessibility: { profile: "custom", textScale: 1.25, targetSize: "standard", reducedMotion: false } })).toMatchObject({ accessibility: { profile: "custom", textScale: 1.25, targetSize: "standard", reducedMotion: false } });
    expect(isPresentationProfile({ ...DEFAULT_PRESENTATION, accessibility: { profile: "custom", textScale: 2, targetSize: "large", reducedMotion: true } })).toBe(true);
    expect(isPresentationProfile({ ...DEFAULT_PRESENTATION, accessibility: { profile: "standard", textScale: 3, targetSize: "standard", reducedMotion: false } } as unknown)).toBe(false);
  });

  it("never accepts an empty custom name or arbitrary theme", () => {
    expect(parsePresentationProfile({ productName: " ", theme: "neon" })).toEqual(DEFAULT_PRESENTATION);
  });

  it("accepts the qualified French Canadian UI locale", () => {
    expect(parsePresentationProfile({ productName: "JohnOS", theme: "dark", locale: "fr-CA" })).toMatchObject({ productName: "JohnOS", theme: "dark", locale: "fr-CA" });
  });

  it("bounds inert personalization and keeps recovery reachable", () => {
    const profile = parsePresentationProfile({
      productName: "JohnOS",
      tagline: "  Private cockpit  ",
      density: "compact",
      typeface: "mono",
      iconography: "glyphs",
      labels: { home: "Today", capture: "Inbox", records: "Journal" },
      navigation: { visible: ["search", "capture"], order: ["search", "capture"] },
      homeWidgets: ["attention", "summary"]
    });
    expect(profile.tagline).toBe("Private cockpit");
    expect(profile.labels).toEqual({ home: "Today", capture: "Inbox", records: "Journal" });
    expect(profile.navigation.visible).toEqual(["search", "capture", "recovery", "presentation"]);
    expect(profile.navigation.order.slice(0, 2)).toEqual(["search", "capture"]);
    expect(profile.homeWidgets).toEqual(["attention", "summary"]);
  });

  it("distinguishes a recoverable profile from malformed stored settings", () => {
    expect(isPresentationProfile({ schemaVersion: 1, productName: "JohnOS", theme: "dark", locale: "en-CA" })).toBe(true);
    expect(isPresentationProfile({ productName: "JohnOS", theme: "dark", locale: "en-CA" })).toBe(false);
  });

  it("round-trips a versioned presentation profile document", () => {
    const profile = parsePresentationProfile({ productName: "JohnOS", theme: "dark", locale: "fr-CA", labels: { home: "Today", capture: "Inbox", records: "Journal" } });
    const document = makePresentationProfileDocument(profile, "2026-09-18T00:00:00.000Z");
    expect(document).toMatchObject({ format: "OMNEVUM_PRESENTATION_PROFILE", version: 1, exportedAt: "2026-09-18T00:00:00.000Z" });
    expect(parsePresentationProfileDocument(document)).toEqual(profile);
  });

  it("upgrades a compatible version-1 profile with omitted newer optional fields", () => {
    const legacyDocument = {
      format: "OMNEVUM_PRESENTATION_PROFILE",
      version: 1,
      exportedAt: "2026-09-18T00:00:00.000Z",
      profile: { schemaVersion: 1, productName: "Legacy", theme: "dark", locale: "en-CA" }
    };
    expect(parsePresentationProfileDocument(legacyDocument)).toMatchObject({
      schemaVersion: 1,
      productName: "Legacy",
      theme: "dark",
      locale: "en-CA",
      density: "comfortable",
      lensPins: ["direction", "people", "self", "resources"],
      activeLens: "direction",
      homeWidgets: ["summary", "insights", "attention"],
      navigation: { visible: expect.arrayContaining(["recovery", "presentation"]), order: expect.arrayContaining(["recovery", "presentation"]) }
    });
  });

  it("rejects malformed or stale presentation profile documents", () => {
    expect(() => parsePresentationProfileDocument(null)).toThrow("Presentation profile document is invalid");
    expect(() => parsePresentationProfileDocument({ format: "OMNEVUM_PRESENTATION_PROFILE", version: 2, exportedAt: "2026-09-18T00:00:00.000Z", profile: DEFAULT_PRESENTATION })).toThrow("Presentation profile document is invalid");
    expect(() => parsePresentationProfileDocument({ format: "OMNEVUM_PRESENTATION_PROFILE", version: 1, exportedAt: "not-a-date", profile: DEFAULT_PRESENTATION })).toThrow("Presentation profile document is invalid");
    expect(() => parsePresentationProfileDocument({ format: "OMNEVUM_PRESENTATION_PROFILE", version: 1, exportedAt: "2026-09-18T00:00:00.000Z", profile: { ...DEFAULT_PRESENTATION, productName: "" } })).toThrow("Presentation profile payload is invalid");
  });

  it("uses a known-good safe profile without rewriting malformed presentation or canonical data", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-safe-presentation`);
    await store.open();
    const malformed = { schemaVersion: 99, productName: "Broken", theme: "neon", locale: "xx" };
    const original = {
      id: "safe-presentation-record",
      recordType: "note" as const,
      owner: "core.capture",
      schemaVersion: 1 as const,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      provenance: { source: "USER_INPUT" as const, capturedAt: new Date().toISOString() },
      truthClass: "USER_OBSERVATION" as const,
      sensitivity: "PRIVATE" as const,
      revision: 1,
      deleted: false,
      data: { text: "preserve" }
    };
    await store.setSetting("presentation", malformed);
    await store.put(original);

    expect(resolvePresentationProfile(malformed, true)).toEqual({ profile: DEFAULT_PRESENTATION, safeMode: true, storedProfileValid: false });
    expect(await store.getSetting("presentation")).toEqual(malformed);
    expect(await store.get(original.id)).toEqual(original);
    store.close();
  });
});
