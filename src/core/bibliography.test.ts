import { describe, expect, it } from "vitest";
import { linkBibliographyEntry, parseBibliography, projectBibliography } from "./bibliography";

describe("bounded bibliography import and derived projection", () => {
  it("imports BibTeX and RIS while preserving source identity", () => {
    const bibtex = parseBibliography("@article{smith2024, title={A Safe Study}, author={Smith, Jane and Doe, Alex}, year={2024}, journal={Journal of Tests}, doi={10.1000/example}}", "BIBTEX", "source:bibtex");
    const ris = parseBibliography("TY  - JOUR\nID  - doe2023\nAU  - Doe, Alex\nTI  - Another Study\nPY  - 2023\nJO  - Review\nER  -", "RIS", "source:ris");
    expect(bibtex.entries[0]).toMatchObject({ id: "smith2024", title: "A Safe Study", issuedYear: 2024, sourceId: "source:bibtex", sourceFormat: "BIBTEX", doi: "10.1000/example" });
    expect(ris.entries[0]).toMatchObject({ id: "doe2023", title: "Another Study", issuedYear: 2023, sourceId: "source:ris", sourceFormat: "RIS" });
  });

  it("imports CSL-JSON authors and makes style changes derived-only", () => {
    const imported = parseBibliography(JSON.stringify([{ id: "csl-1", title: "Structured Evidence", author: [{ family: "Lee", given: "Pat" }], issued: { "date-parts": [[2022]] }, "container-title": "Evidence Review" }]), "CSL_JSON", "source:csl");
    const entry = imported.entries[0];
    if (!entry) throw new Error("bibliography fixture missing");
    const link = linkBibliographyEntry(entry, "artifact-source-1", "Methods section");
    const apa = projectBibliography(imported.entries, "APA", [link]);
    const ieee = projectBibliography(imported.entries, "IEEE", [link]);
    expect(apa.rows[0]).toMatchObject({ entryId: "csl-1", sourceId: "source:csl", artifactRecordId: "artifact-source-1" });
    expect(apa.rows[0]?.bibliography).not.toBe(ieee.rows[0]?.bibliography);
    expect(apa.links).toEqual([link]);
    expect(imported.entries[0]).toEqual(entry);
  });

  it("rejects empty or oversized source input instead of fabricating entries", () => {
    expect(() => parseBibliography("", "RIS", "source:empty")).toThrow("no usable entries");
    expect(() => parseBibliography("x".repeat(2 * 1024 * 1024 + 1), "BIBTEX", "source:large")).toThrow("2 MiB");
  });
});
