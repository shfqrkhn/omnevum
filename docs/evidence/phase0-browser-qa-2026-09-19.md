# v0.18.0 local-browser responsive smoke receipt

- Date: 2026-09-19 (America/Toronto)
- Source revision: `307827ec750abbb9b10f0c1a788a0bce6ef80334`
- Artifact: `http://127.0.0.1:4343/` Vite development server; not a production deployment or release artifact
- Browser targets: Codex in-app Chromium browser and fresh Microsoft Edge profile
- Scope: bounded UI smoke and responsive layout observation; no acceptance scenario or release gate is promoted by this receipt

## Exact observations

- Fresh Edge first-run state at `2552x1274`: compact density by default, no records, no inbox items, and no horizontal overflow (`scrollWidth=2537`, `clientWidth=2537`).
- Fresh Edge mobile override at `390x844` (`clientWidth=375`): compact density, no horizontal overflow (`scrollWidth=375`, `clientWidth=375`).
- Codex in-app Chromium responsive rows: `390x844`, `768x1024`, `1280x800`, and `1440x900`; every row retained compact density and had `scrollWidth === clientWidth`.
- Capture flow: saved `QA smoke note - canonical capture`; active and canonical record counts became `1`; inbox count became `1`.
- Triage flow: marked the captured item reviewed; canonical record count remained `1`, inbox count became `0`.
- Search flow: query `canonical capture` returned `1 result(s); derived index healthy.`
- Recovery flow: Vault export reported `Exported full Vault: 1 record(s), 0 artifact payload(s), 2736 bytes.`
- Accessibility sanity: one `h1`, one `main`, three `nav` landmarks, one `footer`, no duplicate IDs, and no images without alt text were observed in the tested document.

## Source identity

- `src/ui/app.ts` SHA-256: `1e2b5ab16669183198d84570aecce5d8555d1b02d3a16bf0353753cb23ea3787`
- `src/styles.css` SHA-256: `3d6e2ff00623302ee186071485df8a1dea4fd8456b51329f0cb688c606d33558`
- `src/core/presentation.ts` SHA-256: `8b7b2b22fa729277e6e64346e67836f75064d3b0f7f3ff496901074d044398bd`
- `public/sw.js` SHA-256: `ee209c3b183ba5b372717555dc9fec0b6e96c894bcb362701024bf73bc84fa96`

## Limitations and next proof

- The local browser reported storage persistence denied and search was initially degraded in the pre-populated Codex profile; this is observed capability state, not a production defect or PASS.
- This receipt does not cover Safari/WebKit, Firefox, assistive technology, touch hardware, offline/update, quota/corruption/migration injection, cross-origin Vault restore, security/egress, deployment/rollback, or human acceptance.
- Keep Phase 0 and all acceptance scenarios release-visible as `IN_PROGRESS`/`UNKNOWN` until those independent proofs are completed.
