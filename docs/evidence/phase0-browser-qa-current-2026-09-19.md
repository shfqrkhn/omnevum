# v0.18.0 hosted browser QA receipts

## Historical baseline receipt

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

## Candidate compact-layout verification (pre-deployment)

- Candidate source revision: `048494990cce4ba98f38ce0d8bb744f2b0e37178`.
- Target: `http://127.0.0.1:4358/` Vite candidate, Codex in-app Chromium tab 46; this is local candidate evidence and does not replace the hosted receipt above.
- At `390x844`, `768x1024`, and `1440x900`, `document.documentElement.scrollWidth` equaled `clientWidth` (`390`, `753`, and `1425` observed client widths); no horizontal overflow was observed.
- Compact default rendered the primary navigation as a closed disclosure, and Review and Canonical Records remained closed until explicitly requested. Opening navigation rendered its eight visible links in a grid without overflow; selecting Search opened that section and closed navigation.
- The desktop content container expanded to `1180px` at the `1280px` desktop viewport while preserving the same no-overflow invariant.
- This bounded check covers the layout change only; it is not Safari/WebKit, Firefox, assistive-technology, touch-hardware, quota/corruption/migration, cross-origin Vault, rollback, security/egress, or human-acceptance proof.

## Deployed compact-layout qualification

- Source revision: `048494990cce4ba98f38ce0d8bb744f2b0e37178`.
- Target: [https://shfqrkhn.github.io/omnevum/](https://shfqrkhn.github.io/omnevum/); Pages workflow run [35483960007](https://github.com/shfqrkhn/omnevum/actions/runs/35483960007); live Codex in-app Chromium tab 42.
- Published artifact: `f046f093dea26e87a7d4e367126dc7fef87945b343dcb4622876d8c707d61849`; all 8 local `dist` files matched the published files by HTTP SHA-256 and byte length. Published entry smoke test passed.
- Live loaded assets were `assets/index-DOSCdEIf.js` and `assets/index-BM_Xb9D6.css`; the service worker controlled the page.
- At `390x844`, `768x1024`, and `1440x900`, `scrollWidth === clientWidth` (`390`, `753`, and `1425` observed client widths); navigation, Review, and Records were closed by default, and the compact navigation summary was visible.
- At the `1440x900` row, the live main and navigation containers were `1180px`; no horizontal overflow was observed. The local interaction proof (open navigation grid, select Search, menu closes and Search opens) remains bounded to the same candidate source and asset behavior.
- This proves only the compact-layout/deployment slice. Safari/WebKit, Firefox, assistive technology, touch hardware, quota/corruption/migration, cross-origin Vault, rollback, security/egress, and human acceptance remain open.

## Current docs-follow-up deployment

- Source revision: `8e64340f8f3513578c5175eca7c1a5cd4f513a53`.
- Pages repository CI run [35484061520](https://github.com/shfqrkhn/omnevum/actions/runs/35484061520) and Pages run [35484061561](https://github.com/shfqrkhn/omnevum/actions/runs/35484061561) completed successfully after the documentation/control follow-up; the deployed artifact identity remained `f046f093dea26e87a7d4e367126dc7fef87945b343dcb4622876d8c707d61849` with the same 8/8 byte match.
- The live smoke guard remained green. This follow-up changes no product artifact and does not close any remaining target, security, Recovery, or human-acceptance rows.

## Compact mobile first-screen qualification

- Source revision: `eaa1a4444dae69e4b3592ac223e5b9d7dce37d4a`; local candidate `http://127.0.0.1:4370/`; Codex in-app Chromium tab 48.
- The status card retains the visible action-status channel while verbose health telemetry is behind an accessible `System` disclosure. Compact mode keeps that disclosure closed; the disclosure opened and closed through its real summary control and showed the current health snapshot.
- At `390x844`, the compact header was `171.20px`, lens navigation `61.58px` with its list/help text collapsed but its `All lenses` dialog action retained, status card `284.77px`, and Capture began at `589.54px`. At `320x844`, Capture began at `562.88px`. The primary navigation was closed at both widths.
- `scrollWidth === clientWidth` at both phone rows (`390` and `320`). A real Capture submission created one Review item and updated the hidden health snapshot; no horizontal overflow occurred.
- At `1440x900`, compact layout retained a `1180px` main/navigation width and `scrollWidth === clientWidth` (`1425` observed client width). Desktop ordering was unchanged.
- This qualifies the compact first-screen presentation and primary Capture interaction only. It is not Safari/WebKit, Firefox, assistive-technology, touch-hardware, quota/corruption/migration, cross-origin Vault, rollback, security/egress, or human-acceptance proof.
