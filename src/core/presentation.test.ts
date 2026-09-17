import { describe, expect, it } from "vitest";
import { DEFAULT_PRESENTATION, parsePresentationProfile } from "./presentation";

describe("presentation profile", () => {
  it("falls back safely and bounds imported branding", () => {
    expect(parsePresentationProfile(null)).toEqual(DEFAULT_PRESENTATION);
    expect(parsePresentationProfile({ productName: "  JohnOS  ", theme: "dark", locale: "fr-FR" })).toEqual({
      schemaVersion: 1,
      productName: "JohnOS",
      theme: "dark",
      locale: "en-CA"
    });
  });

  it("never accepts an empty custom name or arbitrary theme", () => {
    expect(parsePresentationProfile({ productName: " ", theme: "neon" })).toEqual(DEFAULT_PRESENTATION);
  });

  it("accepts the qualified French Canadian UI locale", () => {
    expect(parsePresentationProfile({ productName: "JohnOS", theme: "dark", locale: "fr-CA" })).toEqual({
      schemaVersion: 1,
      productName: "JohnOS",
      theme: "dark",
      locale: "fr-CA"
    });
  });
});
