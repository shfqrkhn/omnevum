import { describe, expect, it } from "vitest";
import { CredentialKeyBroker } from "./credential";
import { defaultSyncRoutes, SyncRouteRegistry, validatePublicClientConfig } from "./sync-routes";

describe("explicit sync route policy", () => {
  it("keeps manual Vault and owner-controlled routes usable without provider secrets", () => {
    const registry = new SyncRouteRegistry();
    for (const route of defaultSyncRoutes()) registry.register(route);
    expect(registry.usable("manual-vault").auth).toBe("NONE");
    expect(() => registry.usable("google-drive-public-client")).toThrow("unavailable");
    expect(registry.list()).toHaveLength(5);
  });

  it("validates public-client origins without accepting a client secret field", () => {
    expect(validatePublicClientConfig({ provider: "GOOGLE_DRIVE", clientId: "public-id", redirectOrigin: "https://example.test" })).toEqual({ provider: "GOOGLE_DRIVE", clientId: "public-id", redirectOrigin: "https://example.test" });
    expect(() => validatePublicClientConfig({ provider: "ONEDRIVE", clientId: "public-id", redirectOrigin: "http://example.test" })).toThrow("HTTPS");
  });

  it("keeps credential material behind a brokered transport boundary", async () => {
    const broker = new CredentialKeyBroker();
    const metadata = broker.issue("opaque-token", { provider: "test", scope: ["replica.read"], audience: "test", expiresAt: new Date(Date.now() + 60_000).toISOString() });
    expect(metadata).not.toHaveProperty("secret");
    await broker.withSecret(metadata.handleId, "test", async (secret) => expect(secret).toBe("opaque-token"));
  });
});
