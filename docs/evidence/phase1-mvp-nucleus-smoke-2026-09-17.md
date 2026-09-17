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
- An equal-revision semantic Vault conflict is rejected by the unit suite rather than replacing local meaning; the current suite is 23 passing tests across 5 files.
- The durable Effect/Outbox runner persists `IN_FLIGHT`, recovers it as `OUTCOME_UNKNOWN`/`RECONCILE`, and only then invokes the executor; tests cover both idempotent reconciliation and retryable failure persistence.

## Still open

Richer Time/Track schemas, cross-domain visualization beyond summary counts, actual provider-backed external effects, credential/key brokering, browser/accessibility matrix, fault injection, and all applicable acceptance scenarios remain unqualified. Artifact ingestion is bounded and Vault-tested, but broader parser/extraction and target qualification remain open. The completion ledger remains `IN_PROGRESS`.
