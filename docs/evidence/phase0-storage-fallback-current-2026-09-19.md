# Phase 0 IndexedDB fallback receipt

- Authority: `docs/Omnevum-MPES-v0_18_0.md` SHA-256 `103d84308887da9f2eb73caf7eccabb0f68fd14e7c00f876911c9700c15096c8`.
- Current source revision: `eef4c643f831fa1a3c8cbdc0efdac62843f7a133`.
- Command: `npx vitest run src/core/storage.test.ts src/core/migration.test.ts src/core/portable-export.test.ts src/core/update-ledger.test.ts src/core/release-attestation.test.ts`.
- Result: **PASS**, 5 files / 51 tests.

The current `storage.test.ts` fallback case opens a real fake-IndexedDB-backed `CanonicalStore` with storage estimation and persistent-storage APIs deliberately unavailable, writes a canonical record, reads the same record back unchanged, and verifies the optional storage-health object remains undefined rather than inventing a capability. The same current characterization covers pressure reclamation, explicit persistence retry, migration interruption, Vault integrity/idempotence, artifacts, package state, and recovery/update ledgers.

This closes only the OPFS/optional-persistence fallback contract represented by OMN-ACC-026. Real quota exhaustion, target/browser rows, cross-origin family restore, and human acceptance remain separate evidence requirements.
