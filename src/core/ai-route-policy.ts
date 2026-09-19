export type SubscriptionRouteKind = "OFFICIAL_AGENT" | "LOCAL_COMPANION" | "API_KEY" | "WEB_OAUTH_PIGGYBACK";
export type RouteCurrentness = "CURRENT" | "STALE" | "TERMS_BLOCKED" | "UNKNOWN";

export interface SubscriptionRouteInput {
  routeId: string;
  kind: SubscriptionRouteKind;
  official: boolean;
  userEntitled: boolean;
  apiKeyRequired: boolean;
  currentness: RouteCurrentness;
  boundedContext: boolean;
}

export interface SubscriptionRouteDecision {
  outcome: "ENABLE_SUBSCRIPTION" | "DEFER" | "TERMS_BLOCKED" | "REJECT";
  routeId: string;
  apiKeyUsed: false;
  coreUnaffectedWhenDisabled: true;
  reason: string;
}

export type QuotaState = "INCLUDED_AVAILABLE" | "INCLUDED_EXHAUSTED" | "UNKNOWN" | "METERED";

export interface QuotaDecision {
  outcome: "CONTINUE_INCLUDED" | "STOP_AND_NOTIFY" | "REQUIRE_EXPLICIT_CHOICE";
  automaticFallback: false;
  disclosureWidened: false;
  billingActivated: false;
  reason: string;
}

export type TermsRouteKind = "OFFICIAL_AGENT" | "LOCAL_MODEL" | "MANUAL_HANDOFF" | "BROWSER_AUTOMATION" | "OAUTH_PIGGYBACK";

export interface TermsRouteDecision {
  outcome: "ALLOW" | "TERMS_BLOCKED" | "DEFER";
  stealthOrImpersonation: false;
  reason: string;
}

export interface ReverseIntegrationInput {
  boundedProjection: boolean;
  revocationVerified: boolean;
  readOnly: boolean;
  writeRequested: boolean;
  semanticCommandPath: boolean;
  permissionPath: boolean;
  effectOutboxPath: boolean;
}

export interface ReverseIntegrationDecision {
  outcome: "ALLOW_READ_ONLY" | "ALLOW_WRITE_VIA_CORE" | "DEFER" | "REJECT";
  canonicalDataPreservedOnDisable: true;
  reason: string;
}

export function evaluateSubscriptionRoute(input: SubscriptionRouteInput): SubscriptionRouteDecision {
  if (!/^[a-z][a-z0-9._-]{1,80}$/u.test(input.routeId) || !input.boundedContext) return decision(input.routeId, "REJECT", "Route identity or bounded context is invalid");
  if (input.kind === "WEB_OAUTH_PIGGYBACK" || input.currentness === "TERMS_BLOCKED") return decision(input.routeId, "TERMS_BLOCKED", "Consumer-web/OAuth piggyback is not an admitted subscription route");
  if (input.kind === "API_KEY" || input.apiKeyRequired) return decision(input.routeId, "DEFER", "This subscription decision cannot silently introduce an API key or metered route");
  if (!input.official || !input.userEntitled) return decision(input.routeId, "DEFER", "Official current route and user entitlement are not both established");
  if (input.currentness !== "CURRENT") return decision(input.routeId, "DEFER", "Route currentness is not current");
  return decision(input.routeId, "ENABLE_SUBSCRIPTION", "Official entitled route may run only against the explicit bounded context");
}

export function evaluateQuotaBoundary(state: QuotaState, explicitAlternativeAllowed: boolean): QuotaDecision {
  if (state === "INCLUDED_AVAILABLE") return { outcome: "CONTINUE_INCLUDED", automaticFallback: false, disclosureWidened: false, billingActivated: false, reason: "Included quota is available" };
  if (state === "INCLUDED_EXHAUSTED") return { outcome: "STOP_AND_NOTIFY", automaticFallback: false, disclosureWidened: false, billingActivated: false, reason: "Included quota is exhausted; no purchase or metered switch is automatic" };
  if (!explicitAlternativeAllowed) return { outcome: "STOP_AND_NOTIFY", automaticFallback: false, disclosureWidened: false, billingActivated: false, reason: "Quota state is uncertain; the route stops without widening disclosure or billing" };
  return { outcome: "REQUIRE_EXPLICIT_CHOICE", automaticFallback: false, disclosureWidened: false, billingActivated: false, reason: state === "METERED" ? "A metered route requires explicit user policy" : "An alternative route requires explicit user policy" };
}

export function evaluateTermsRoute(kind: TermsRouteKind, currentness: RouteCurrentness): TermsRouteDecision {
  if (kind === "OAUTH_PIGGYBACK" || (kind === "BROWSER_AUTOMATION" && currentness !== "CURRENT")) return { outcome: "TERMS_BLOCKED", stealthOrImpersonation: false, reason: "No consumer-web extraction, OAuth harvesting, stealth, or browser impersonation is attempted" };
  if (currentness !== "CURRENT") return { outcome: "DEFER", stealthOrImpersonation: false, reason: "Route terms/currentness require an authoritative refresh" };
  return { outcome: "ALLOW", stealthOrImpersonation: false, reason: "Route is current and explicitly allowed for this bounded profile" };
}

export function evaluateReverseIntegration(input: ReverseIntegrationInput): ReverseIntegrationDecision {
  if (!input.boundedProjection || !input.revocationVerified) return { outcome: "DEFER", canonicalDataPreservedOnDisable: true, reason: "Bounded projection and revocation evidence are required" };
  if (input.readOnly && !input.writeRequested) return { outcome: "ALLOW_READ_ONLY", canonicalDataPreservedOnDisable: true, reason: "Read-only external access is limited to the bounded projection" };
  if (input.writeRequested && input.semanticCommandPath && input.permissionPath && input.effectOutboxPath) return { outcome: "ALLOW_WRITE_VIA_CORE", canonicalDataPreservedOnDisable: true, reason: "Write action must traverse semantic command, permission, and Effect/Outbox owners" };
  return { outcome: "REJECT", canonicalDataPreservedOnDisable: true, reason: "External write is not admitted without every core authority boundary" };
}

function decision(routeId: string, outcome: SubscriptionRouteDecision["outcome"], reason: string): SubscriptionRouteDecision {
  return { outcome, routeId, apiKeyUsed: false, coreUnaffectedWhenDisabled: true, reason };
}
