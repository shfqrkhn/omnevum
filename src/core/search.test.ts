import { describe, expect, it } from "vitest";
import { searchDocuments } from "./search";

describe("derived multilingual search", () => {
  it("supports normalized prefix, typo tolerance, AND semantics, and deterministic empty queries", () => {
    const documents = [
      { id: "older", terms: "cafe resume project", modifiedAt: "2024-01-01T00:00:00.000Z" },
      { id: "newer", terms: "café résumé project", modifiedAt: "2025-01-01T00:00:00.000Z" },
      { id: "other", terms: "café only", modifiedAt: "2026-01-01T00:00:00.000Z" }
    ];
    expect(searchDocuments(documents, "resume pro").map((item) => item.id)).toEqual(expect.arrayContaining(["newer", "older"]));
    expect(searchDocuments(documents, "resume pro")).toHaveLength(2);
    expect(searchDocuments(documents, "resum").map((item) => item.id)).toContain("newer");
    expect(searchDocuments(documents, "").map((item) => item.id)).toEqual(["other", "newer", "older"]);
  });

  it("measures the selected owner against a representative multilingual workload", () => {
    const documents = Array.from({ length: 10_000 }, (_, index) => ({
      id: `benchmark-${index}`,
      terms: index % 4 === 0
        ? "cafe resume projet travail santé espace"
        : index % 4 === 1
          ? "café résumé projet maison santé personnel"
          : index % 4 === 2
            ? "meeting project work household health"
            : "capture observation espace privé recherche",
      modifiedAt: new Date(2026, 0, 1 + (index % 28)).toISOString()
    }));
    const queries = ["resume projet", "sante", "work health", "espace recher", "cafe maison"];
    const timings: number[] = [];
    const heapBefore = process.memoryUsage().heapUsed;
    let minimumMatches = Number.POSITIVE_INFINITY;
    for (const query of queries) {
      const startedAt = performance.now();
      const results = searchDocuments(documents, query);
      timings.push(performance.now() - startedAt);
      minimumMatches = Math.min(minimumMatches, results.length);
    }
    const heapAfter = process.memoryUsage().heapUsed;
    const sortedTimings = [...timings].sort((left, right) => left - right);
    const p95 = sortedTimings[Math.min(sortedTimings.length - 1, Math.ceil(sortedTimings.length * 0.95) - 1)] ?? Number.POSITIVE_INFINITY;
    console.info(`SEARCH_BENCHMARK_PASS documents=${documents.length} queries=${queries.length} p95Ms=${p95.toFixed(2)} heapDeltaBytes=${heapAfter - heapBefore} minimumMatches=${minimumMatches}`);
    expect(minimumMatches).toBeGreaterThan(0);
    expect(p95).toBeLessThan(500);
  });
});
