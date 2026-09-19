import { describe, expect, it } from "vitest";
import { characterizeHealthImport, parseHealthExport, stageHealthExportForTriage } from "./health-import";

describe("bounded user health export intake", () => {
  it("parses CSV, preserves subject/provenance, and stages idempotent candidates", () => {
    const measurements = parseHealthExport("externalId,metric,value,unit,measuredAt\nheart-1,heart_rate,72,bpm,2026-09-19T18:00:00Z\nheart-1,heart_rate,72,bpm,2026-09-19T18:00:00Z\n", "CSV", "source:wearable-export", "person:self");
    const candidates = stageHealthExportForTriage(measurements);
    expect(measurements).toHaveLength(1);
    expect(candidates).toMatchObject([{ recordType: "observation", owner: "platform.health", data: { subjectId: "person:self", sourceId: "source:wearable-export", triageStatus: "INBOX" } }]);
    expect(candidates[0]?.candidateId).toBe("source:wearable-export:heart-1");
  });

  it("parses JSON and rejects invalid measurements", () => {
    const measurements = parseHealthExport(JSON.stringify({ measurements: [{ id: "sleep-1", type: "sleep", value: 7.5, unit: "hours", timestamp: "2026-09-18T07:00:00Z" }] }), "JSON", "source:health-json", "person:child");
    expect(measurements[0]).toMatchObject({ externalId: "sleep-1", subjectId: "person:child", value: 7.5 });
    expect(() => parseHealthExport(JSON.stringify([{ metric: "bad", value: "not-a-number", unit: "x", measuredAt: "2026-09-19" }]), "JSON", "source:bad", "person:self")).toThrow("row 1");
  });

  it("states the direct browser limitation without disabling file import", () => {
    expect(characterizeHealthImport()).toMatchObject({ fileImport: "SUPPORTED_WITH_LIMITS", directBrowserHealthApi: "PLATFORM_LIMITED" });
  });
});
