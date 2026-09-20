# Phase 0 Pages deployment — sync/service-worker candidate — 2026-09-20

## Identity and workflows

- Product source: `876ac61e98c862860cdab7bdffd634e82b128f4e`.
- Pages workflow commit: `3ee926df64b7d879ed95a98c3af3b93ee1684e1d`.
- CI: [workflow 35490309581](https://github.com/shfqrkhn/omnevum/actions/runs/35490309581), successful.
- Pages: [workflow 35490309607](https://github.com/shfqrkhn/omnevum/actions/runs/35490309607), build/deploy/published-entry smoke successful.
- Target: `https://shfqrkhn.github.io/omnevum/`.
- Artifact digest: `a47805e44b7c7edfbd8a4be56173c4e65932bca03da3509dcb72663cb81e55b8`.
- Service-worker cache: `omnevum-shell-c4d404f1dbf50456`.

## Independent byte probe

The Node fetch probe used `cache: "no-store"` and compared each receipt-bound local `dist/` file to its public relative path. All 8 paths returned HTTP `200`; every public byte length and SHA-256 matched its local artifact exactly:

`assets/index-Bzh0zw-4.css`, `assets/index-Dy2ff13B.js`, `assets/index-Dy2ff13B.js.map`, `icon.svg`, `index.html`, `manifest.webmanifest`, `recovery.html`, and `sw.js`.

This closes the deployment byte-identity observation for this candidate only. It does not prove production rollback, offline/update interruption, native quota/eviction, other browser families, security/egress, or human acceptance. The product remains `NOT_RELEASE_READY` with all open mandatory rows release-visible.
