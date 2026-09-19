import { describe, expect, it } from "vitest";
import { ONBOARDING_AUTO_SHOW_RECORD_THRESHOLD, shouldAutoShowOnboarding } from "./onboarding";

describe("onboarding visibility", () => {
  it("keeps the empty and early-use shell calm", () => {
    expect(shouldAutoShowOnboarding(0, false)).toBe(false);
    expect(shouldAutoShowOnboarding(ONBOARDING_AUTO_SHOW_RECORD_THRESHOLD - 1, false)).toBe(false);
  });

  it("auto-shows only after accumulated records and respects dismissal", () => {
    expect(shouldAutoShowOnboarding(ONBOARDING_AUTO_SHOW_RECORD_THRESHOLD, false)).toBe(true);
    expect(shouldAutoShowOnboarding(ONBOARDING_AUTO_SHOW_RECORD_THRESHOLD + 1, true)).toBe(false);
  });

  it("rejects non-integral counts at the boundary", () => {
    expect(shouldAutoShowOnboarding(3.5, false)).toBe(false);
    expect(shouldAutoShowOnboarding(-1, false)).toBe(false);
  });
});
