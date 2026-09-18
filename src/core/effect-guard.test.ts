import { describe, expect, it } from "vitest";
import { CredentialKeyBroker } from "./credential";
import { createEffectRevalidationGuard } from "./effect-guard";
import type { EffectOperation } from "./effect";

const operation = (authorization = { authority: "local-user", permission: "effect.execute", space: "personal", disclosureClass: "PRIVATE" as const, schema: "effect-json-v1" }): EffectOperation => ({
  operationId: "guard-effect",
  owner: "platform.test",
  originatingCommand: "test.command",
  purpose: "test effect",
  destination: "https://remote.example.test/action",
  payloadOrReference: { value: "safe" },
  idempotencyKey: "guard-effect-key",
  createdAt: new Date().toISOString(),
  status: "PENDING",
  retryCount: 0,
  retryPolicy: { maxAttempts: 3, backoffSeconds: 1 },
  authorization,
  evidence: []
});

describe("effect revalidation guard", () => {
  it("accepts a current authority, Space, disclosure class, and schema", async () => {
    const guard = createEffectRevalidationGuard({ authority: "local-user", allowedPermissions: ["effect.execute"], availableSpaces: () => new Set(["personal"]), allowedDisclosureClasses: ["PRIVATE"], supportedSchemas: ["effect-json-v1"] });
    await expect(guard.authorize(operation())).resolves.toBeUndefined();
  });

  it("rejects changed authority, Space, disclosure, or schema", async () => {
    const guard = createEffectRevalidationGuard({ authority: "new-user", allowedPermissions: ["effect.execute"], availableSpaces: () => new Set(["work"]), allowedDisclosureClasses: ["SHARED"], supportedSchemas: ["effect-json-v2"] });
    await expect(guard.authorize(operation())).rejects.toThrow("authority");
    const current = createEffectRevalidationGuard({ authority: "local-user", allowedPermissions: ["effect.execute"], availableSpaces: () => new Set(["work"]), allowedDisclosureClasses: ["PRIVATE"], supportedSchemas: ["effect-json-v1"] });
    await expect(current.authorize(operation())).rejects.toThrow("Space");
  });

  it("delegates credential validity to the broker without exposing the secret", async () => {
    const broker = new CredentialKeyBroker();
    const credential = broker.issue("raw-secret", { provider: "test", scope: ["write"], audience: "remote" });
    const guard = createEffectRevalidationGuard({ authority: "local-user", allowedPermissions: ["effect.execute"], availableSpaces: () => new Set(["personal"]), allowedDisclosureClasses: ["PRIVATE"], supportedSchemas: ["effect-json-v1"], credentialBroker: broker });
    await expect(guard.authorize({ ...operation(), credentialHandle: credential.handleId })).resolves.toBeUndefined();
    broker.revoke(credential.handleId);
    await expect(guard.authorize({ ...operation(), credentialHandle: credential.handleId })).rejects.toThrow("revoked");
  });
});
