# Phase 1 MVP nucleus smoke receipt

Date: 2026-09-17  
Status: PARTIAL; vertical smoke only and not an MVP release claim

## Observed in the production preview

- Home summarized active records by Space and record type without creating projection copies.
- A Work task was captured through `core.capture` and appeared in both the Home summary and the triage inbox.
- Marking an inbox item reviewed produced a new canonical revision rather than mutating a copy.
- A focus session started and stopped without background tracking and persisted as a `platform.time` observation with start, end, duration, Space, and provenance fields.
- The new Relate surface exposes source/target selectors and states that relationships are reference records; implementation is covered by the command-level test.
- A small local `README.md` file was ingested as an Artifact; the UI reported its byte size and the canonical list/Home summary gained one artifact without exposing its contents to a remote service.
- The Relate surface created a `platform.relate` reference record from the Artifact to the Work task; neither source record was copied or re-owned.
- The presentation profile switched the entire controlled UI to French (Canada), retained the selected locale across reload, and left canonical record identities unchanged.
- Recovery exposed archived-record visibility/restore, read-only Vault merge preview, derived-search repair, and category-level privacy-minimized diagnostics; the diagnostics status explicitly excluded canonical content and credentials while separating runtime evidence from `NOT_PROVIDED`/`CONTRACT_ONLY` states.
- An equal-revision semantic Vault conflict is rejected by the unit suite rather than replacing local meaning; the current regression run is 111 passing tests across 40 files.
- The durable Effect/Outbox runner persists `IN_FLIGHT`, recovers it as `OUTCOME_UNKNOWN`/`RECONCILE`, and only then invokes the executor; tests cover both idempotent reconciliation and retryable failure persistence.
- Track/Observe now accepts a bounded numeric metric, unit, and Space through `platform.track`; the Home Visualize/Analyze surface derives open/completed tasks, focus minutes, and relationship counts without a second writable owner.
- The Space surface can add an explicit membership overlay and filter Home, Triage, Search results, and archived records without copying or re-owning the canonical record.
- Revisioned records expose an expandable field-level history summary in the canonical-record surface; reverting remains a normal command-path operation.
- Safe Presentation Mode was enabled and exited in the production preview; the known-good profile rendered while the stored French presentation remained available after exit, and canonical counts remained unchanged.
- Compose/View saved a user-defined dashboard through the native form, rendered a list/table/descriptive chart over authorized records, and reproduced the view after a production-preview reload; Vault export/import now carries validated view overlays separately from canonical records.
- The startup capability runtime records READY/DEGRADED states and contains a failing optional module without preventing core Home/Recovery startup; the current regression run is 111 passing tests across 40 files.
- The same regression run covers bounded Acquire/Ingest (including hostile-text and embedded-credential URL guards), source-linked Evidence and Annotation, Place/Geo, derived Data/Analyze, declarative Compose/Automation, package/game lifecycle contracts, Device/Input detection and bounded file/clipboard guards, optional AI/credential/effect boundaries, multilingual derived Search, migration, sharing, sync routes, exact Money/Quantity, storage fault/reclamation, and recovery validation.

## Current built-artifact integrated run

The current `npm run ci` build at source revision `11ebcac` (artifact digest `b77e0d9e82c110736c0da2e4e742af5b066d8f3ad6029c7fcd778d00fbee02a1`, worker cache `omnevum-shell-864f5f5b6e7567d4`) was served with `npm run preview -- --host 127.0.0.1 --port 4179` on a fresh local origin in the Codex In-app Browser Chromium surface.

- A fresh shell accepted a canonical note, URL Acquire candidate, Track observation, exact-currency expense, subject-bound health observation, and a user-defined Compose dashboard.
- Compose rendered the saved projection as Capture, Records list, Table, and descriptive Chart without canonical duplication; Relate then created one reference record without copying either source.
- Search returned one matching result and a healthy derived index; the presentation switched to AMOLED Dark, rebranded the controlled UI to `JohnOS`, switched to French (Canada), and retained the branding/locale and seven canonical records after reload.
- A downloaded local Vault fixture opened the new non-mutating merge confirmation; confirming it reported `11` imported and `0` skipped, with the built UI remaining usable and the canonical list increasing to `17` records.

This is reproducible local Chromium/static-preview evidence for the integrated MVP path only. It does not qualify GitHub Pages, other browser families, WCAG conformance, native quota exhaustion, cross-origin browser-family recovery, external providers, or release readiness.

## Still open

Richer Time/Track schemas, cross-domain visualization beyond summary counts, actual provider-backed external effects, durable credential/key brokering, browser/accessibility matrix, native quota/canonical-migration fault injection, and all applicable acceptance scenarios remain unqualified. Artifact ingestion is bounded and Vault-tested, but broader parser/extraction and target qualification remain open. The completion ledger remains `IN_PROGRESS`.
