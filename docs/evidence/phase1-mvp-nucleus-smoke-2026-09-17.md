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
- Recovery exposed archived-record visibility/restore, derived-search repair, and privacy-minimized diagnostics; the diagnostics status explicitly excluded canonical content and credentials.
- An equal-revision semantic Vault conflict is rejected by the unit suite rather than replacing local meaning; the current regression run is 100 passing tests across 39 files.
- The durable Effect/Outbox runner persists `IN_FLIGHT`, recovers it as `OUTCOME_UNKNOWN`/`RECONCILE`, and only then invokes the executor; tests cover both idempotent reconciliation and retryable failure persistence.
- Track/Observe now accepts a bounded numeric metric, unit, and Space through `platform.track`; the Home Visualize/Analyze surface derives open/completed tasks, focus minutes, and relationship counts without a second writable owner.
- The Space surface can add an explicit membership overlay and filter Home, Triage, Search results, and archived records without copying or re-owning the canonical record.
- Revisioned records expose an expandable field-level history summary in the canonical-record surface; reverting remains a normal command-path operation.
- Safe Presentation Mode was enabled and exited in the production preview; the known-good profile rendered while the stored French presentation remained available after exit, and canonical counts remained unchanged.
- Compose/View saved a user-defined dashboard through the native form, rendered a list/table/descriptive chart over authorized records, and reproduced the view after a production-preview reload; Vault export/import now carries validated view overlays separately from canonical records.
- The startup capability runtime records READY/DEGRADED states and contains a failing optional module without preventing core Home/Recovery startup; the current regression run is 106 passing tests across 40 files.
- The same regression run covers bounded Acquire/Ingest (including hostile-text and embedded-credential URL guards), source-linked Evidence and Annotation, Place/Geo, derived Data/Analyze, declarative Compose/Automation, package/game lifecycle contracts, Device/Input detection and bounded file/clipboard guards, optional AI/credential/effect boundaries, multilingual derived Search, migration, sharing, sync routes, exact Money/Quantity, storage fault/reclamation, and recovery validation.

## Still open

Richer Time/Track schemas, cross-domain visualization beyond summary counts, actual provider-backed external effects, durable credential/key brokering, browser/accessibility matrix, native quota/canonical-migration fault injection, and all applicable acceptance scenarios remain unqualified. Artifact ingestion is bounded and Vault-tested, but broader parser/extraction and target qualification remain open. The completion ledger remains `IN_PROGRESS`.
