import { describe, expect, it } from "vitest";
import { DEFAULT_PRESENTATION, isPresentationProfile, parsePresentationProfile, resolvePresentationProfile } from "./presentation";
import { CanonicalStore } from "./storage";

describe("presentation profile", () => {
  it("falls back safely and bounds imported branding", () => {
    expect(parsePresentationProfile(null)).toEqual(DEFAULT_PRESENTATION);
    expect(parsePresentationProfile({ productName: "  JohnOS  ", theme: "dark", locale: "fr-FR" })).toMatchObject({
      schemaVersion: 1,
      productName: "JohnOS",
      theme: "dark",
      locale: "en-CA",
      density: "comfortable",
      typeface: "system",
      iconography: "labels"
    });
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
