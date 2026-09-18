import { describe, expect, it } from "vitest";
import { formatDateTime, formatNumber, getDeviceInputCopy, getInstalledMetadataStatus, getStoragePersistenceNotice, getUiCopy, localeDirection } from "./i18n";

describe("presentation localization contract", () => {
  it("keeps claimed locales offline and exposes direction/formatting", () => {
    expect(getUiCopy("en-CA").capture).toBe("Capture");
    expect(getUiCopy("fr-CA").capture).toBe("Capture");
    expect(getUiCopy("en-CA").onboardingHint).toContain("No account");
    expect(getUiCopy("fr-CA").onboardingHeading).toContain("Commencez");
    expect(getUiCopy("fr-CA").onboardingDismiss).toContain("Masquer");
    expect(localeDirection("en-CA")).toBe("ltr");
    expect(formatNumber("en-CA", 1234)).toContain("1");
    expect(formatDateTime("en-CA", "not-a-date")).toBe("not-a-date");
  });

  it("reports the installed-host metadata boundary without widening identity authority", () => {
    expect(getInstalledMetadataStatus("en-CA", true)).toContain("PLATFORM_LIMITED");
    expect(getInstalledMetadataStatus("en-CA", true)).toContain("re-add");
    expect(getInstalledMetadataStatus("fr-CA", false)).toContain("PLATFORM_LIMITED");
    expect(getInstalledMetadataStatus("fr-CA", false)).toContain("identite technique d'installation");
  });

  it("keeps Device/Input guidance localized and explicit about retention", () => {
    expect(getDeviceInputCopy("en-CA").hint).toContain("explicit action");
    expect(getDeviceInputCopy("en-CA").mediaGranted("camera")).toContain("released");
    expect(getDeviceInputCopy("fr-CA").locationStaged).toContain("enregistrez-la");
  });

  it("exposes storage persistence state with portable recovery guidance", () => {
    expect(getStoragePersistenceNotice("en-CA", "DENIED")).toBe("Storage persistence: denied; export a Vault for portability.");
    expect(getStoragePersistenceNotice("fr-CA", "UNAVAILABLE")).toBe("Persistance du stockage : indisponible; exportez un Vault pour la portabilite.");
    expect(getStoragePersistenceNotice("en-CA", "GRANTED")).toBe("Storage persistence: granted.");
  });
});
