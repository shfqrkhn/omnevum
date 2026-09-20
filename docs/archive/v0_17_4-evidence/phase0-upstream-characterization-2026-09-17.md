# Phase 0 upstream characterization receipt

Date: 2026-09-17  
Status: CHARACTERIZED_FOR_PHASE0; revalidate exact heads, advisories, licenses, and provider terms before promotion or release

## Method

Each candidate was checked at its recorded Git head, with package metadata, repository layout, public contracts, tests, and lifecycle seams inspected. A feature list is not adoption evidence. The candidate remains outside Omnevum runtime authority until its adapter contract, target profile, migration behavior, security, license, and replacement path pass independently.

## Findings

### NeumanOS

- Source: `https://github.com/travisjneuman/neumanos`, HEAD `f4b2a174a339fc60524645a19417daedaf69ac91`, package `1.5.0`, MIT.
- Strong harvest value: broad React productivity surface, browser tests, IndexedDB/Dexie persistence, migration tests, import/export, full-text search, and many reusable UI/domain fixtures.
- Replacement risk: the application is already a large product with many Zustand stores, database/service modules, migration paths, framework/runtime dependencies, and domain-specific owners. Taking it as Omnevum's platform would import multiple authorities and a large dependency/lifecycle surface before canonical contracts are proven.
- Decision: `HARVEST_REFERENCE`; do not adopt as the whole-app launchpad. Reuse only isolated patterns/tests after owner, license, security, and target qualification.
- Characterization paths: `src/App.tsx`, `src/services/indexedDB.ts`, `src/services/migration.ts`, `src/services/storageMigration.ts`, `src/lib/syncedStorage.ts`, `config/vitest.config.ts`, `.github/workflows/browser-tests.yml`.

### Kurumi

- Source: `https://github.com/raskell-io/kurumi`, HEAD `5453bbb08630d5b36138f8d3dc186b81be1ca93e`, package `0.0.1`, MIT.
- Strong harvest value: SvelteKit static/PWA route, local-first note/capture/search/review surfaces, Automerge repository, IndexedDB/blob stores, version history, import/export, sync providers, and browser-local AI seams.
- Replacement risk: the app couples SvelteKit routing, Automerge document ownership, Git/file synchronization, AI/inference, and many domain UI routes. Its semantics are a useful reference but are not interchangeable with Omnevum's canonical record envelope and one-action spine.
- Decision: `HARVEST_REFERENCE`; do not adopt as the whole-app launchpad. Characterize Automerge and UI patterns behind Omnevum adapters only when a representative benchmark proves lifecycle value.
- Characterization paths: `src/lib/db/store.ts`, `src/lib/db/blob-store.ts`, `src/lib/sync/service.ts`, `src/lib/sync/webdav.ts`, `src/lib/git/service.ts`, `src/lib/components/VersionHistoryModal.svelte`, `src/routes/+layout.svelte`.

### SelfStore

- Source: `https://github.com/selfstoredev/selfstore`, HEAD `0b56c7fdf74fe8e8d5ffeb9025f3e6893275338e`, package `1.8.22`, MIT.
- Strong fit: explicit portable archive specification, IndexedDB/local cache, encrypted backup primitives, passkey/device-key options, backup targets, replicas, conflict/merge code, status/error contracts, and an unusually broad test suite including fuzz/property-style sync tests and threat/release documents.
- Boundary: its data model and security/profile choices remain SelfStore-owned. It does not remove Omnevum's need for semantic Vault mapping, canonical IDs/provenance, credential policy, provider qualification, or Recovery UX.
- Decision: `ADOPT_CANDIDATE_PHASE2`; use a dependency-isolated spike and contract adapter before changing the Phase 0 core. Retain the current small Vault path as the fallback until encryption, migration, quota, recovery, and target tests pass.
- Characterization paths: `SPEC.md`, `THREAT-MODEL.md`, `src/persistence/store.ts`, `src/selfstore/archive.ts`, `src/backups/manager.ts`, `src/sync/merge.ts`, `src/passkey/passkey.ts`, `src/**/*.test.ts`.

### remoteStorage.js

- Source: `https://github.com/remotestorage/remotestorage.js`, HEAD `d899b5aee41849fc94c45470cfad08a7363780b6`, package `2.0.0-beta.10`, MIT.
- Strong fit: mature remoteStorage protocol client with local IndexedDB/in-memory caching, scoped data modules, OAuth/discovery/access handling, ETag/revision-aware sync, provider adapters, conformance/unit tests, and explicit backend integration seams.
- Boundary: it is a client for a remoteStorage-compatible endpoint; connection, OAuth, CORS, backend availability, and provider terms remain external. It is therefore not a static-core storage authority or a mandatory backend.
- Decision: `ADAPT_OPTIONAL_ENDPOINT_PHASE2`; qualify as one provider-neutral endpoint adapter only after the core Vault/sync contract, credential broker, conflict semantics, and zero-backend fallback are stable.
- Characterization paths: `src/indexeddb.ts`, `src/cachinglayer.ts`, `src/sync.ts`, `src/access.ts`, `src/authorize.ts`, `src/wireclient.ts`, `test/unit/sync.test.mjs`, `test/unit/indexeddb.test.mjs`, `test/conformance.js`.

## Phase 0 outcome

The whole-app launchpad remains the small Omnevum Vite/TypeScript/native-DOM foundation because it is the only candidate that does not import an unqualified second application authority. NeumanOS and Kurumi remain high-value harvest references; SelfStore is the leading Phase 2 Vault/sync candidate; remoteStorage.js is an optional endpoint adapter candidate. The next proof is a schema-driven UI and browser-local search/analysis bake-off on representative mobile/multilingual Vault fixtures, followed by the MVP vertical slice.

## Currentness revalidation follow-up (2026-09-18)

Read-only `git ls-remote <source> HEAD` checks returned the same accepted identities for all four primary candidates: NeumanOS `f4b2a174a339fc60524645a19417daedaf69ac91`, Kurumi `5453bbb08630d5b36138f8d3dc186b81be1ca93e`, SelfStore `0b56c7fdf74fe8e8d5ffeb9025f3e6893275338e`, and remoteStorage.js `d899b5aee41849fc94c45470cfad08a7363780b6`. The current public project pages still describe NeumanOS as a broad local-only React/IndexedDB productivity platform, Kurumi as a local-first AI-native PWA with capture/recall/sync, SelfStore as browser-local encrypted backup/merge/sync infrastructure, and remoteStorage.js as a local browser cache plus optional remoteStorage/Dropbox/Google Drive client.

No disposition changes: NeumanOS and Kurumi remain harvest references, SelfStore remains a Phase 2 adoption candidate, and remoteStorage.js remains an optional Phase 2 adapter. This refresh proves source-head currentness only; it does not qualify their target behavior, security, migration, provider terms, licenses beyond the recorded identities, or Omnevum adapter integration.

## Current v0.18.0 launchpad donor refresh

On 2026-09-19, read-only `git ls-remote <source> HEAD` checks recorded NeumanOS `f4b2a174a339fc60524645a19417daedaf69ac91`, Kurumi `5453bbb08630d5b36138f8d3dc186b81be1ca93e`, OneBench `7676115b72cce425d435d91a942dd0cf1f50fd04`, and Utopia `69d02995af94e785be1c850e77056f7b121917ce` as the current heads observed for the v0.18.0 launchpad baseline. The public repository pages identify OneBench as MIT-licensed and configuration-driven/local-first with single-file/PWA and user-owned deployment patterns; Utopia identifies itself as source-available under PolyForm Noncommercial 1.0.0 with a native Expo/React-Native package-runtime shape; NeumanOS and Kurumi retain their recorded MIT harvest identities. These are currentness/role observations, not adoption or security evidence.

The v0.18.0 disposition is role-specific: NeumanOS remains the provisional primary launchpad subject to OMN-FOSS-014; Kurumi remains a Capture/Search/sync/conflict donor; OneBench is a modular/static-PWA packaging and user-owned-deployment donor; and Utopia is an architecture-only package-runtime/app-factory donor until exact license/runtime compatibility is qualified. No donor source, dependency, localStorage store, native runtime, provider, credential, or remote code entered Omnevum. The six-flow canonical-core transplantability workload, duplicate-authority enforcement, migration/rollback proof, browser/target qualification, and acceptance scenarios OMN-ACC-173..176 remain open.
