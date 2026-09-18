import { describe, expect, it } from "vitest";
import { isAutomationRule, evaluateRule } from "./automation";
import { assertEffectOperation, type EffectOperation } from "./effect";
import { isGameManifest } from "./game";
import type { PackageManifest } from "./package-contract";

const packageManifest: PackageManifest = { packageId: "safe.package", version: "1.0.0", displayName: "Safe", trustClass: "DECLARATIVE", frameworkApi: "omnevum-sdk-1", entrypoints: ["declarative"], ownedCanonicalTypes: [], commands: { consumes: [], provides: [] }, capabilities: { required: [], optional: [] }, permissions: [], externalEffects: [], dataSchema: "schema-1", migrations: [], lifecycle: { offline: "local", recovery: "disable", rollback: "previous", uninstall: "retain", retirement: "stop" }, accessibility: "WCAG", inputProfile: ["touch"], localization: ["en-CA"] };

const effect: EffectOperation = { operationId: "effect-security", owner: "platform.test", originatingCommand: "test.command", purpose: "test", destination: "https://example.test", payloadOrReference: { value: "safe" }, idempotencyKey: "effect-security-key", createdAt: new Date().toISOString(), status: "PENDING", retryCount: 0, retryPolicy: { maxAttempts: 3, backoffSeconds: 1 }, evidence: [] };

describe("security-sensitive contract bounds", () => {
  it("rejects deeply nested automation at validation time and does not traverse inherited context", () => {
    let expression: unknown = { op: "exists", path: "safe" };
    for (let index = 0; index < 80; index += 1) expression = { op: "not", arg: expression };
    expect(isAutomationRule({ schemaVersion: 1, ruleId: "deep.rule", version: 1, trigger: "MANUAL", when: expression, actions: [], enabled: true })).toBe(false);
    expect(evaluateRule({ op: "exists", path: "toString" }, {})).toBe(false);
  });

  it("rejects oversized or secret-shaped effect state before persistence", () => {
    expect(() => assertEffectOperation({ ...effect, payloadOrReference: { accessToken: "never" } })).toThrow("Raw credential");
    expect(() => assertEffectOperation({ ...effect, retryPolicy: { maxAttempts: 1, backoffSeconds: -1 } })).toThrow("retry policy");
    expect(() => assertEffectOperation({ ...effect, payloadOrReference: { value: "x".repeat(20_001) } })).toThrow("bounded");
  });

  it("requires game manifests to satisfy the package contract and bounded runtime budgets", () => {
    expect(isGameManifest({ ...packageManifest, archetype: "GAME", runtimeAdapter: "counter", saveSchemaVersion: 1, inputActions: ["increment"], budgets: { frameMs: 16, memoryMb: 64, assetBytes: 1000 } })).toBe(true);
    expect(isGameManifest({ ...packageManifest, archetype: "GAME", runtimeAdapter: "counter", saveSchemaVersion: 1, inputActions: ["increment"], budgets: { frameMs: 0, memoryMb: 64, assetBytes: 1000 } })).toBe(false);
  });
});
