import { describe, expect, it } from "vitest";
import { JsonEndpointEffectExecutor, JsonEndpointTransport } from "./remote";
import type { CanonicalRecord } from "./model";
import type { EffectOperation } from "./effect";
import { CredentialKeyBroker } from "./credential";

function record(): CanonicalRecord {
  const now = new Date().toISOString();
  return { id: "remote", recordType: "note", owner: "core.capture", schemaVersion: 1, createdAt: now, modifiedAt: now, provenance: { source: "USER_INPUT", capturedAt: now }, truthClass: "USER_OBSERVATION", sensitivity: "PRIVATE", revision: 1, deleted: false, data: { text: "safe" } };
}

function effect(): EffectOperation {
  return { operationId: "effect-remote", owner: "platform.test", originatingCommand: "test.command", purpose: "send test", destination: "https://remote.example.test/action", payloadOrReference: { value: "safe" }, idempotencyKey: "effect-remote-key", credentialHandle: "credential-test", createdAt: new Date().toISOString(), status: "IN_FLIGHT", retryCount: 0, retryPolicy: { maxAttempts: 3, backoffSeconds: 1 }, evidence: [] };
}

describe("bounded remote sync transport", () => {
  it("binds the browser fetch when no request override is supplied", async () => {
    const expected = record();
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async (_input, init) => init?.method === "PUT"
      ? new Response(null, { status: 204 })
      : new Response(JSON.stringify({ format: "OMNEVUM_REPLICA", version: 1, records: [expected] }), { status: 200, headers: { "content-type": "application/json" } });
    try {
      const transport = new JsonEndpointTransport("http://localhost/replica");
      await expect(transport.pull()).resolves.toEqual([expected]);
      await expect(transport.push([expected])).resolves.toBeUndefined();
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  it("uses an explicit HTTPS endpoint and validates pulled records", async () => {
    let pushed = "";
    const expected = record();
    const transport = new JsonEndpointTransport("https://sync.example.test/replica", async (_input, init) => {
      if (init?.method === "PUT") { pushed = String(init.body); return new Response(null, { status: 204 }); }
      return new Response(JSON.stringify({ format: "OMNEVUM_REPLICA", version: 1, records: [expected] }), { status: 200, headers: { "content-type": "application/json" } });
    });
    await expect(transport.pull()).resolves.toEqual([expected]);
    await transport.push([expected]);
    expect(pushed).toContain("remote");
  });

  it("rejects insecure non-local endpoints and malformed replicas", async () => {
    expect(() => new JsonEndpointTransport("http://sync.example.test/replica")).toThrow("HTTPS");
    const transport = new JsonEndpointTransport("http://localhost/replica", async () => new Response(JSON.stringify({ records: [{ bad: true }] }), { status: 200 }));
    await expect(transport.pull()).rejects.toThrow("valid bounded replica");
  });

  it("executes one typed idempotent request through the credential broker without exposing the secret in the payload", async () => {
    const broker = new CredentialKeyBroker();
    const metadata = broker.issue("remote-secret", { provider: "test", scope: ["write"], audience: "remote" });
    const operation = { ...effect(), credentialHandle: metadata.handleId };
    let seenHeaders: Headers | undefined;
    let seenBody = "";
    const executor = new JsonEndpointEffectExecutor("https://remote.example.test/action", async (_input, init) => {
      seenHeaders = new Headers(init?.headers);
      seenBody = String(init?.body ?? "");
      return new Response(JSON.stringify({ outcome: "SUCCEEDED", remoteIdentity: "remote-1" }), { status: 201, headers: { "content-type": "application/json" } });
    }, broker);
    await expect(executor.execute(operation)).resolves.toMatchObject({ outcome: "SUCCEEDED", remoteIdentity: "remote-1" });
    expect(seenHeaders?.get("Idempotency-Key")).toBe("effect-remote-key");
    expect(seenHeaders?.get("Authorization")).toBe("Bearer remote-secret");
    expect(seenBody).not.toContain("remote-secret");
    expect(seenBody).toContain("effect-remote-key");
  });

  it("converts an ambiguous request failure to reconcile instead of blindly replaying it", async () => {
    const operation = effect();
    delete operation.credentialHandle;
    const executor = new JsonEndpointEffectExecutor("https://remote.example.test/action", async (_input, init) => {
      if (init?.method === "POST") throw new Error("connection lost after send");
      return new Response(JSON.stringify({ outcome: "SUCCEEDED", remoteIdentity: "remote-reconciled" }), { status: 200 });
    });
    await expect(executor.execute(operation)).resolves.toMatchObject({ outcome: "OUTCOME_UNKNOWN" });
    await expect(executor.reconcile(operation)).resolves.toMatchObject({ outcome: "SUCCEEDED", remoteIdentity: "remote-reconciled" });
  });

  it("bounds remote effect responses and classifies retryable HTTP failures", async () => {
    const operation = effect();
    delete operation.credentialHandle;
    const retryable = new JsonEndpointEffectExecutor("https://remote.example.test/action", async () => new Response("offline", { status: 503 }));
    await expect(retryable.execute(operation)).resolves.toMatchObject({ outcome: "FAILED_RETRYABLE", evidence: ["remote-http-503"] });
    const oversized = new JsonEndpointEffectExecutor("https://remote.example.test/action", async () => new Response("x".repeat(5 * 1024 * 1024 + 1), { status: 200 }));
    await expect(oversized.execute(operation)).resolves.toMatchObject({ outcome: "FAILED_TERMINAL", evidence: ["remote-response-too-large"] });
  });
});
