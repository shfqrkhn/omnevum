import { describe, expect, it } from "vitest";
import { createExternalEffect } from "./effect-service";

describe("external effect staging", () => {
  it("creates a normalized pending operation without contacting a destination", () => {
    const operation = createExternalEffect({ destination: "https://remote.example.test/action", purpose: "  create item  ", payloadOrReference: { value: "safe" } }, new Date("2026-01-01T00:00:00.000Z"));
    expect(operation).toMatchObject({ owner: "platform.effect", originatingCommand: "effect.enqueue", purpose: "create item", destination: "https://remote.example.test/action", status: "PENDING", retryCount: 0, createdAt: "2026-01-01T00:00:00.000Z", evidence: ["staged-by-user"] });
    expect(operation.operationId).toMatch(/^effect_/);
    expect(operation.idempotencyKey).toMatch(/^effect-key_/);
  });

  it("rejects insecure destinations and raw credential-shaped payloads", () => {
    expect(() => createExternalEffect({ destination: "http://remote.example.test/action", purpose: "send", payloadOrReference: {} })).toThrow("HTTPS");
    expect(() => createExternalEffect({ destination: "https://remote.example.test/action", purpose: "send", payloadOrReference: { accessToken: "never" } })).toThrow("Raw credential");
  });
});
