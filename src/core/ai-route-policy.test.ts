import { describe, expect, it } from "vitest";
import { evaluateQuotaBoundary, evaluateReverseIntegration, evaluateSubscriptionRoute, evaluateTermsRoute } from "./ai-route-policy";

describe("fail-closed AI subscription and reverse-route policy", () => {
  it("admits an official entitled subscription without an API key and blocks piggyback", () => {
    expect(evaluateSubscriptionRoute({ routeId: "official-agent", kind: "OFFICIAL_AGENT", official: true, userEntitled: true, apiKeyRequired: false, currentness: "CURRENT", boundedContext: true })).toMatchObject({ outcome: "ENABLE_SUBSCRIPTION", apiKeyUsed: false, coreUnaffectedWhenDisabled: true });
    expect(evaluateSubscriptionRoute({ routeId: "web-route", kind: "WEB_OAUTH_PIGGYBACK", official: false, userEntitled: true, apiKeyRequired: false, currentness: "CURRENT", boundedContext: true }).outcome).toBe("TERMS_BLOCKED");
  });

  it("stops at exhausted or uncertain quota without automatic billing/fallback", () => {
    expect(evaluateQuotaBoundary("INCLUDED_EXHAUSTED", false)).toMatchObject({ outcome: "STOP_AND_NOTIFY", automaticFallback: false, billingActivated: false, disclosureWidened: false });
    expect(evaluateQuotaBoundary("UNKNOWN", true).outcome).toBe("REQUIRE_EXPLICIT_CHOICE");
  });

  it("requires current terms and core authority for reverse integration writes", () => {
    expect(evaluateTermsRoute("BROWSER_AUTOMATION", "TERMS_BLOCKED").outcome).toBe("TERMS_BLOCKED");
    expect(evaluateReverseIntegration({ boundedProjection: true, revocationVerified: true, readOnly: true, writeRequested: false, semanticCommandPath: false, permissionPath: false, effectOutboxPath: false }).outcome).toBe("ALLOW_READ_ONLY");
    expect(evaluateReverseIntegration({ boundedProjection: true, revocationVerified: true, readOnly: false, writeRequested: true, semanticCommandPath: true, permissionPath: true, effectOutboxPath: true }).outcome).toBe("ALLOW_WRITE_VIA_CORE");
    expect(evaluateReverseIntegration({ boundedProjection: true, revocationVerified: true, readOnly: false, writeRequested: true, semanticCommandPath: true, permissionPath: false, effectOutboxPath: true }).outcome).toBe("REJECT");
  });
});
