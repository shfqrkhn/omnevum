# Phase 0 launchpad-owner release artifact identity

- Authority: `docs/Omnevum-MPES-v0_18_0.md` SHA-256 `103d84308887da9f2eb73caf7eccabb0f68fd14e7c00f876911c9700c15096c8`.
- Product source revision: `93650343b0e46ef2db3c5a36f01bb74f471c79c4`.
- Build command: `npm run build` — PASS.
- Artifact digest: `462875502ec63ffccedd707fb558745805252ab84eda294213a2542e4665d699` (the repository static-audit row ordering).
- Service-worker cache: `omnevum-shell-5738511387984ad7`.

The eight deterministic `dist/` files are recorded in `docs/control/release-evidence.json` with exact SHA-256 and byte lengths. The source bundle changed from the previous receipt because the typed launchpad admission seam and four live Capture owner routes are now included. Static/release audit is expected to bind to this identity before publication.

This is a local artifact receipt only. GitHub Pages deployment, HTTP byte comparison, rollback, browser-family support, and human acceptance remain release-visible limitations until independently observed.
