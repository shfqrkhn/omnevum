import { describe, expect, it } from "vitest";
import { formatDateTime, formatNumber, getUiCopy, localeDirection } from "./i18n";

describe("presentation localization contract", () => {
  it("keeps claimed locales offline and exposes direction/formatting", () => {
    expect(getUiCopy("en-CA").capture).toBe("Capture");
    expect(getUiCopy("fr-CA").capture).toBe("Capture");
    expect(localeDirection("en-CA")).toBe("ltr");
    expect(formatNumber("en-CA", 1234)).toContain("1");
    expect(formatDateTime("en-CA", "not-a-date")).toBe("not-a-date");
  });
});
