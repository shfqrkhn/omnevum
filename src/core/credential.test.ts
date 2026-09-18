import { describe, expect, it } from "vitest";
import { CredentialKeyBroker } from "./credential";

describe("credential/key broker", () => {
  it("returns opaque metadata while allowing a bounded purpose callback", async () => {
    const broker = new CredentialKeyBroker();
    const metadata = broker.issue("raw-secret", { provider: "test", scope: ["read"], audience: "test-service" });
    expect(JSON.stringify(metadata)).not.toContain("raw-secret");
    await expect(broker.withSecret(metadata.handleId, "test request", async (secret) => secret)).resolves.toBe("raw-secret");
  });

  it("revokes and clears session-only secret material", async () => {
    const broker = new CredentialKeyBroker();
    const metadata = broker.issue("raw-secret", { provider: "test", scope: ["read"], audience: "test-service" });
    broker.revoke(metadata.handleId);
    await expect(broker.withSecret(metadata.handleId, "test request", async () => "unexpected")).rejects.toThrow("unavailable");
    broker.clear();
    expect(broker.metadata(metadata.handleId)).toBeUndefined();
  });
});
