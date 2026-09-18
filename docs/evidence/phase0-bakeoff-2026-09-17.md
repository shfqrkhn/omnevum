# Phase 0 reuse-before-build bake-off receipt

Date: 2026-09-17 (initial comparison); refreshed 2026-09-18
Status: REPEATABLE_HOST_BENCHMARK; target qualification and release evidence remain incomplete

## Search

The representative fixture contained 2,000 records with English, accented French, Space, and work/health terms. A temporary isolated npm install was used; no candidate was added except the selected search adapter after the run.

| Candidate | Exact package | License | Source head | Build ms | Query ms | Result note |
| --- | --- | --- | --- | ---: | ---: | --- |
| MiniSearch | 7.2.0 | MIT | `3d239d1c3ae7aef1bf5d8945dd7b5f0709f646f5` | 10.82 | 2.92 | 2,000 accent-normalized matches |
| FlexSearch | 0.8.212 | Apache-2.0 | `f7ed963096a0792da7b2fd63bb7114b3fbac55ed` | 0.11 | 0.82 | 0 matches for the accented fixture under the tested document configuration |
| Orama | 3.1.18 | Apache-2.0 | `b030e1bd1d330327bad1483f2d9c88a9ea0d493c` | 30.04 | 3.50 | 10 returned under the default result limit |

The measurements are one local Node run and do not transfer to mobile/browser performance. MiniSearch is the current adapter choice because it met the representative multilingual query behavior with a small integration boundary; its derived index remains rebuildable and permission-filtered by the platform store. Reopen this decision for representative mobile memory/latency before a release profile is frozen.

## Repeatable selected-owner workload

`npx vitest run src/core/search.test.ts --reporter=verbose` now exercises the real `searchDocuments` owner against 10,000 multilingual records and five prefix/normalized queries. The 2026-09-18 local Node/Vitest receipt reported `SEARCH_BENCHMARK_PASS documents=10000 queries=5 p95Ms=57.39 heapDeltaBytes=35917120 minimumMatches=2500`; the test keeps a deliberately broad 500 ms host guardrail and proves every query returns matches. The observed heap delta is diagnostic rather than a mobile memory budget.

This makes the selected-owner workload repeatable and prevents gross local regressions. It does not qualify a mobile browser, browser heap ceiling, thermal behavior, or target latency; run the same fixture on the frozen supported mobile/browser rows before changing OMN-ACC-057 to PASS.

## Schema-driven UI and analysis

Exact npm metadata was inspected without runtime admission:

- JSON Forms `@jsonforms/core` 3.8.0, MIT, repository head `41b7991e7753b2c4d851cbbf73bb7408cf5486da`, unpacked package metadata size 1,171,137 bytes.
- React JSON Schema Form `@rjsf/core` 6.10.1, Apache-2.0, repository head `3002e47912943dfd100a7ecbe266074895e38a97`, unpacked package metadata size 2,354,154 bytes.
- DuckDB-Wasm `@duckdb/duckdb-wasm` 1.33.1-dev57.0, MIT, repository head `def100b4be91a8ba27d441914e496231695ba0a8`, unpacked package metadata size 149,377,663 bytes.

The native DOM/TypeScript foundation remains the selected core presentation path because it is framework-independent, already accessible/testable, and avoids a 149 MB analytical runtime in the static core. JSON Forms/RJSF and DuckDB-Wasm remain isolated Phase 2/4 candidates; any admission requires browser/mobile bundle, worker, offline-asset, accessibility, and cancellation measurements.

## Artifact/parser candidates

- PDF.js `pdfjs-dist` 6.3.289, Apache-2.0, source head `ba667924f62fdb9d50f14ab3b383fed06d36ab03`, metadata size 34,781,083 bytes.
- SheetJS `xlsx` 0.18.5, Apache-2.0 metadata, source head `515d1c6f2e1d3ca422ee9198b177cfd926434936`, metadata size 7,499,035 bytes.

Neither parser is admitted to the runtime yet. Artifact/Acquire keeps bounded source-preserving text/JSON/CSV/URL paths and records the exact candidate seam for a later worker/resource/active-content qualification. Package metadata and repository labels are not legal or security assurance.

## Decision and limits

Search adapter admission is implemented behind `src/core/search.ts`; all other candidates remain `REFERENCE_ONLY` or `CANDIDATE`. The run does not establish target-device support, licensing compliance, parser safety, WASM availability, or production readiness.
