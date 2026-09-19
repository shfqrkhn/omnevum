import { describe, expect, it } from "vitest";
import { projectTelemetry } from "./telemetry";

describe("persistent runtime telemetry projection", () => {
  it("reports the quiet healthy state without turning it into a score", () => {
    const snapshot = projectTelemetry({
      replication: { enabled: true },
      backup: { lastVerifiedAt: "2026-09-18T12:00:00.000Z" },
      pendingEffects: 0,
      degradedCapabilities: [],
      unresolvedConflicts: 0,
      storagePressure: "NORMAL",
      now: new Date("2026-09-19T12:00:00.000Z")
    });

    expect(snapshot.facts.map((fact) => fact.status)).toEqual(["READY", "CURRENT", "CLEAR", "READY", "CLEAR", "NORMAL"]);
    expect(snapshot.attentionCount).toBe(0);
    expect(snapshot.unknownCount).toBe(0);
    expect(JSON.stringify(snapshot)).not.toMatch(/score|streak|engagement/i);
  });

  it("preserves each injected fault as an explicit attention state", () => {
    const snapshot = projectTelemetry({
      replication: { enabled: false },
      backup: { lastVerifiedAt: "2026-08-01T00:00:00.000Z", maxAgeMs: 24 * 60 * 60 * 1000 },
      pendingEffects: 2,
      degradedCapabilities: ["core.search"],
      unresolvedConflicts: 1,
      storagePressure: "ELEVATED",
      now: new Date("2026-09-19T12:00:00.000Z")
    });

    expect(snapshot.facts.map((fact) => [fact.id, fact.status, fact.health])).toEqual([
      ["replication", "DISABLED", "HEALTHY"],
      ["backup", "STALE", "ATTENTION"],
      ["outbox", "BACKLOGGED", "ATTENTION"],
      ["capability", "DEGRADED", "ATTENTION"],
      ["conflict", "UNRESOLVED", "ATTENTION"],
      ["storage", "ELEVATED", "ATTENTION"]
    ]);
    expect(snapshot.attentionCount).toBe(5);
  });

  it("never infers health when a source fact is unavailable or malformed", () => {
    const snapshot = projectTelemetry({
      replication: "UNKNOWN",
      backup: "UNKNOWN",
      pendingEffects: "UNKNOWN",
      degradedCapabilities: "UNKNOWN",
      unresolvedConflicts: "UNKNOWN",
      storagePressure: "UNKNOWN"
    });

    expect(snapshot.unknownCount).toBe(6);
    expect(snapshot.attentionCount).toBe(0);
    expect(snapshot.facts.every((fact) => fact.status === "UNKNOWN" && fact.health === "UNKNOWN")).toBe(true);
  });
});
