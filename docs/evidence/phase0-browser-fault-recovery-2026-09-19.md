# v0.18.0 live browser search-corruption and canonical-recovery receipt

- Date: 2026-09-19 (America/Toronto)
- Source revision: `56980b46fe478e1fcd95a47d4e4c76d1f103e7af`
- Target: [https://shfqrkhn.github.io/omnevum/](https://shfqrkhn.github.io/omnevum/)
- Artifact digest: `03a6eb2e8c3bbfdac6cc29c0abfa1210e7cfddd76062195874f543881ddf47aa`; service-worker cache `omnevum-shell-4b0fcf7bba597af9`
- Browser: isolated Microsoft Edge QA tab `1690081704`; desktop viewport `2552x1274`, `clientWidth=2537`, `scrollWidth=2537`
- The later direct-route check used the same isolated Edge profile against deployment run `35481859772` at source revision `69eeb5957cb0db007a029c47c33a29d1b04c0eef`.

## Search-index fault proof

- CDP `Runtime.evaluate` inserted the malformed fixture `{ "id": "qa-corrupt-search" }` into the `searchDocuments` IndexedDB store without changing the valid canonical record.
- After reload, System reported `search index degraded`, while the canonical record remained visible.
- Search for `Fresh Edge acceptance` rebuilt the derived index and reported `1 result(s); derived index healthy.` The original canonical record remained present and the malformed fixture was not exposed.

This is exact current-target evidence for `OMN-ACC-008` and supports `PASS` for that scenario.

## Canonical Recovery fault proof

- CDP inserted `{ "id": "qa-corrupt-record", "recordType": "note" }` into the canonical `records` store.
- Reload failed closed with `Existing data was not deleted. Invalid canonical record` and exposed Retry, Export retained state, and Repair from retained snapshot.
- Export reported a read-only recovery snapshot without changing canonical data. Repair confirmation then reported `retained 1 record(s), removed 1 malformed record(s), and retained 2 history entries.`
- Reload returned to the normal app with `summary-total=1`; the malformed fixture was absent and compact layout remained intact.

This supports only partial normal Recovery evidence. It does not prove the independent last-resort console, shell-update interruption, quota exhaustion, cross-origin restore, Safari/WebKit, Firefox, assistive technology, or human acceptance.

## Independent last-resort console proof

- Navigating directly to `https://shfqrkhn.github.io/omnevum/recovery.html` rendered the independent `OMNEVUM_LAST_RESORT_RECOVERY` console with no application-shell dependency. The console read the same origin's canonical store as `Readable; version 6; 1 raw record(s)`, reported `STRUCTURALLY_VALID; 1 valid, 0 invalid`, and reported `FULL_CANONICAL_READ` with two history rows.
- The console's `Scan local state` completed and enabled `Export retained snapshot`; activating it reported `Exported 2,846 bytes. Canonical state was not changed.`
- Current source hash for the stable route is `public/recovery.html` `9f55fd72b899a429660514f6c165d961e7bd664acf3856fffcb1613f35f3aea8`. The repository static audit separately verifies the route has no remote or module dependency.

This independently proves the read/export route and upgrades `OMN-ACC-125` only to `PARTIAL`; the required two deliberate shell failures, including update interruption and all target variants, remain open.

## Cross-origin Vault restore proof

- The live Pages origin exported a full Vault through the normal Recovery UI: `1 record(s)`, `0 artifact payload(s)`, `2,718 bytes`; downloaded file `omnevum-vault (5).json`, SHA-256 `3903504995d89003fc9f3f094e1ee3da186867e190fa8e33ba19fe0016dad378`.
- A clean second-origin development target `http://127.0.0.1:4357/` started with `0 active` and `0 revision snapshot(s)`. The same Vault was selected through the visible Import Vault flow, previewed as `1 record(s), 2 history entries, 0 artifact payload(s); 1 will import, 0 will skip`, and confirmed.
- The target reported `Imported 1 record(s); skipped 0.` and `record-count=1`. After reload it still reported `1 active`, `2 revision snapshot(s)`, and the imported `Fresh Edge acceptance probe` remained visible.

This is real browser, cross-origin manual portability evidence and strengthens `OMN-ACC-010` only to `PARTIAL`; it is not the materially different browser-family proof required for PASS.

## Disposable shell-update ledger proof

- On a disposable Vite origin `http://127.0.0.1:4357/`, the active service worker initially reported `omnevum-shell-v1`. A temporary QA-only script revision with `CACHE_NAME = "omnevum-shell-qa-update"` (fixture hash `bd257f599877297477438739107f9209b89de788d4f90a1c72c924ac81020ca6`) was served only by that stopped local test server; the committed `public/sw.js` was restored to hash `ee209c3b183ba5b372717555dc9fec0b6e96c894bcb362701024bf73bc84fa96` immediately afterward.
- The visible Recovery > Shell update ledger detected `WAITING - omnevum-shell-v1`, exposed `Activate waiting shell`, and showed the declared rollback path. After explicit activation and reload it reported `Active shell cache: omnevum-shell-qa-update` and an `ACTIVATED` ledger entry.
- Cleanup unregistered 1 disposable service worker, deleted 3 disposable caches, deleted the disposable `omnevum-canonical-v1` database, and stopped the temporary server. No committed application source or user origin was left modified.

This is bounded browser evidence for the shell-only waiting/activation portion of `OMN-ACC-123` and supports `PARTIAL`; canonical schema-migration approval, interruption, and repair remain open.

## Disposable browser migration-abort proof

- On the disposable origin `http://127.0.0.1:4357/` at source revision `cb6e59658f8fdbd014423e0bc87f3666f981c7e7`, the visible Capture flow created `Migration abort retention probe`; the app reported one active canonical record and one revision snapshot.
- A CDP `Runtime.evaluate` fixture opened `omnevum-canonical-v1` from version 6 toward version 7, entered `onupgradeneeded`, and deliberately aborted the upgrade transaction. The request ended with `AbortError` after `upgraded=true`; a fresh open reported version 6 and the original stores (`artifactBlobs`, `effects`, `history`, `records`, `searchDocuments`, `searchMeta`, `settings`).
- Reloading the app reported `record-count=1`, `summary-total=1`, and retained `Migration abort retention probe`. Cleanup then unregistered 1 disposable service worker, deleted 2 disposable caches, deleted the disposable database, and stopped the server.

This is real browser crash/interruption evidence for `OMN-ACC-017` and the migration-interruption portion of `OMN-ACC-123`, both still `PARTIAL`; the user-facing migration approval, verified-backup prompt, and repair/retry path remain unqualified.

## Source hashes

- `src/core/storage.ts`: `b1aec9639873716b2566576862c93592f0a33f29b87b457cda933d4c6815c189`
- `src/ui/app.ts`: `1e2b5ab16669183198d84570aecce5d8555d1b02d3a16bf0353753cb23ea3787`
- `public/sw.js`: `ee209c3b183ba5b372717555dc9fec0b6e96c894bcb362701024bf73bc84fa96`
