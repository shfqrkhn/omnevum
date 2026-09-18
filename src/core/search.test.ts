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
});
