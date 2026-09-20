# v0.18.0 storage, Vault, migration, and Recovery characterization receipt

- Date: 2026-09-19 (America/Toronto)
- Source revision: `3e4778658faa2d7b266a92229108148e851baf76`
- Command: `npx vitest run src/core/storage.test.ts src/core/migration.test.ts src/core/portable-export.test.ts src/core/update-ledger.test.ts src/core/release-attestation.test.ts`
- Result: 5 files passed; 48 tests passed; duration 314 ms

## Covered executable contracts

- Search-derived state can be invalidated, detected, rebuilt, and reclaimed without changing canonical records.
- Malformed canonical rows produce a read-only recovery snapshot; repair retains valid records and skips invalid rows.
- Injected quota pressure reclaims derived state first, retains canonical records, reports pressure, and exposes persistence retry/fallback states.
- Interrupted IndexedDB migration preserves the prior canonical record; stale clients are fenced after a version change.
- Vault export/import preserves semantic IDs, revisions, provenance, history, presentation, artifacts, package state, and automation rules; repeated imports are idempotent, integrity-tampered imports are rejected, and tombstones prevent silent resurrection.
- Migration rehearsal requires explicit approval and a current verified backup for canonical changes; shell-only changes retain a rollback path.
- Release/update ledger entries are bounded and fail closed for malformed or secret-shaped state; exact artifact attestation rejects digest/signature mismatches.

## Source hashes

- `src/core/storage.ts`: `b1aec9639873716b2566576862c93592f0a33f29b87b457cda933d4c6815c189`
- `src/core/storage.test.ts`: `85ddc527e34d64eb8e7491d5608ecded30b49888e5c1c84935f2e53227581e1c`
- `src/core/migration.ts`: `c2b6e809c14802f1f21094e1ae501c474ad2d4183eebeea3218edb21b9afc8f4`
- `src/core/migration.test.ts`: `be5b3b49a6a747265ca07b9ae734af5352a88a6247b51d58c0eb71750068c937`
- `src/core/portable-export.ts`: `eacc0d51fd7610187d0ccb264ff120424623058a2732320fadd64076e145ceeb`
- `src/core/portable-export.test.ts`: `bb3c702eb192d940635fbc1ca110e30c75192a96559e4508f2f41a21d7daf5e7`
- `src/core/update-ledger.ts`: `5d48f0581beb445ab51875d188eaa2cfcc2e4fc696509c618f37b34635146332`
- `src/core/release-attestation.ts`: `b812473541272eaafc686d79e2e1ee98fd501f2dc45cfba42d922f414da0d862`

## Boundaries

This is executable contract evidence, not browser fault injection or a release PASS. It does not prove real quota exhaustion, OPFS-specific behavior, cross-origin restoration on materially different browser families, service-worker interruption, Safari/WebKit/Firefox, assistive technology, rollback, security/egress, or human acceptance.
