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

  it("rehydrates an opaque handle after process restart without persisting the secret", async () => {
    const firstProcess = new CredentialKeyBroker();
    const issued = firstProcess.issue("old-secret", { provider: "test", scope: ["read"], audience: "test-service", recoveryReference: "host-authorized-reference" });
    const restartedProcess = new CredentialKeyBroker();

    expect(restartedProcess.metadata(issued.handleId)).toBeUndefined();
    const restored = restartedProcess.restoreSession(issued.handleId, "new-secret", { provider: "test", scope: ["read"], audience: "test-service", recoveryReference: "host-authorized-reference" });

    expect(restored).toMatchObject({ handleId: issued.handleId, storageClass: "SESSION_MEMORY", recoveryReference: "host-authorized-reference" });
    expect(JSON.stringify(restored)).not.toContain("new-secret");
    await expect(restartedProcess.withSecret(issued.handleId, "restored request", async (secret) => secret)).resolves.toBe("new-secret");
    expect(() => restartedProcess.restoreSession(issued.handleId, "another-secret", { provider: "test", scope: ["read"], audience: "test-service" })).toThrow("recovery reference");
  });
});
