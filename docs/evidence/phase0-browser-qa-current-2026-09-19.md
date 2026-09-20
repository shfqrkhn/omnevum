# v0.18.0 current hosted browser QA receipt

- Date: 2026-09-19 (America/Toronto)
- Source revision: `542b665b361d579ee6d8e3ab2f331ce3afca5cd6`
- Target: [https://shfqrkhn.github.io/omnevum/](https://shfqrkhn.github.io/omnevum/)
- Artifact: `03a6eb2e8c3bbfdac6cc29c0abfa1210e7cfddd76062195874f543881ddf47aa`; service-worker cache `omnevum-shell-4b0fcf7bba597af9`
- Browser: Codex in-app Chromium tab 42; responsive rows were exercised with temporary DevTools viewport emulation

## Observations

- After Pages was switched from legacy `master:/` to the Actions artifact source, reload loaded the built relative asset URLs (`./assets/index-Cte7gjJ7.js` and `./assets/index-1nEyWL5r.css`) rather than `/src/main.ts`.
- At `390x844`, `768x1024`, `1280x800`, and `1440x900`, compact density remained the default and `scrollWidth === clientWidth` (`390`, `768`, `1265`, and `1425`, respectively).
- The current document had one `h1`, one `main`, three `nav` landmarks, one `footer`, no duplicate IDs, and no images missing `alt`.
- The service worker controlled the page. With the network emulated offline, the cached shell remained rendered and a local Search for `Live Pages smoke` returned `1 result(s); derived index healthy.` The page was restored online after the check.

## Boundaries

This receipt supports only partial offline/deployment/responsive evidence. It is not a Safari/WebKit, Firefox, assistive-technology, touch-hardware, quota/corruption/migration, cross-origin Vault, rollback, security/egress, or human-acceptance proof. It does not promote a release or `100_PERCENT_COMPLETE` claim.
