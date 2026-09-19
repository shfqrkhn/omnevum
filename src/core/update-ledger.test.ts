import { describe, expect, it } from "vitest";
import { MAX_UPDATE_LEDGER_ENTRIES, appendShellUpdateObservation, isShellUpdateLedgerEntry, parseShellUpdateLedger, type ShellUpdateLedgerEntry } from "./update-ledger";

const observation = (releaseId: string, decision: "ACTIVATED" | "WAITING" | "ROLLED_BACK" = "ACTIVATED") => ({
  releaseId,
  shellVersion: releaseId,
  cacheName: releaseId,
  observedAt: "2026-09-19T12:00:00.000Z",
  decision,
  rollbackPath: "retain the previous service-worker cache generation and export a Vault before canonical migration"
});

describe("service-worker update ledger", () => {
  it("fails closed for malformed or secret-shaped persisted entries", () => {
    expect(parseShellUpdateLedger([{ schemaVersion: 1, releaseId: "omnevum-shell-good", shellVersion: "omnevum-shell-good", cacheName: "omnevum-shell-good", observedAt: "2026-09-19T12:00:00.000Z", decision: "ACTIVATED", rollbackPath: "retain previous" }, { cacheName: "omnevum-shell-bad" }, { schemaVersion: 1, releaseId: "omnevum-shell-secret", shellVersion: "omnevum-shell-secret", cacheName: "omnevum-shell-secret", observedAt: "2026-09-19T12:00:00.000Z", decision: "ACTIVATED", rollbackPath: "Bearer token=do-not-store" }])).toHaveLength(2);
    expect(isShellUpdateLedgerEntry({ ...observation("omnevum-shell-a"), schemaVersion: 1 })).toBe(true);
  });

  it("deduplicates a release decision, bounds history, and keeps the newest first", () => {
    let ledger: ShellUpdateLedgerEntry[] = [];
    for (let index = 0; index < MAX_UPDATE_LEDGER_ENTRIES + 2; index += 1) {
      const releaseId = `omnevum-shell-${index.toString(16)}`;
      ledger = appendShellUpdateObservation(ledger, observation(releaseId));
    }
    expect(ledger).toHaveLength(MAX_UPDATE_LEDGER_ENTRIES);
    expect(ledger[0]?.releaseId).toBe(`omnevum-shell-${(MAX_UPDATE_LEDGER_ENTRIES + 1).toString(16)}`);
    const replaced = appendShellUpdateObservation(ledger, { ...observation("omnevum-shell-a"), observedAt: "2026-09-19T13:00:00.000Z" });
    expect(replaced.filter((entry) => entry.releaseId === "omnevum-shell-a" && entry.decision === "ACTIVATED")).toHaveLength(1);
    expect(replaced.find((entry) => entry.releaseId === "omnevum-shell-a")?.observedAt).toBe("2026-09-19T13:00:00.000Z");
  });
});
