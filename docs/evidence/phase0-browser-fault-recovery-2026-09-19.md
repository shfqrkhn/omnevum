# v0.18.0 live browser search-corruption and canonical-recovery receipt

- Date: 2026-09-19 (America/Toronto)
- Source revision: `56980b46fe478e1fcd95a47d4e4c76d1f103e7af`
- Target: [https://shfqrkhn.github.io/omnevum/](https://shfqrkhn.github.io/omnevum/)
- Artifact digest: `03a6eb2e8c3bbfdac6cc29c0abfa1210e7cfddd76062195874f543881ddf47aa`; service-worker cache `omnevum-shell-4b0fcf7bba597af9`
- Browser: isolated Microsoft Edge QA tab `1690081704`; desktop viewport `2552x1274`, `clientWidth=2537`, `scrollWidth=2537`

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

## Source hashes

- `src/core/storage.ts`: `b1aec9639873716b2566576862c93592f0a33f29b87b457cda933d4c6815c189`
- `src/ui/app.ts`: `1e2b5ab16669183198d84570aecce5d8555d1b02d3a16bf0353753cb23ea3787`
- `public/sw.js`: `ee209c3b183ba5b372717555dc9fec0b6e96c894bcb362701024bf73bc84fa96`
