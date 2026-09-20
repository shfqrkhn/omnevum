# v0.18.0 launchpad-owner GitHub Pages deployment receipt

- Date: 2026-09-19 (America/Toronto)
- Source revision: `bae641adcf51cdd7f3f80d1125c153471cca7bb3`
- Product source increment: `93650343b0e46ef2db3c5a36f01bb74f471c79c4`
- Deployment URL: [https://shfqrkhn.github.io/omnevum/](https://shfqrkhn.github.io/omnevum/)
- Repository CI: [run 35485983527](https://github.com/shfqrkhn/omnevum/actions/runs/35485983527) — PASS.
- Pages build/deploy and published-entry smoke: [run 35485983525](https://github.com/shfqrkhn/omnevum/actions/runs/35485983525) — PASS.
- Artifact digest: `462875502ec63ffccedd707fb558745805252ab84eda294213a2542e4665d699`.
- Service-worker cache: `omnevum-shell-5738511387984ad7`.

## HTTP proof

On 2026-09-19, `fetch` against the deployed static HTTPS origin returned HTTP 200 for all eight expected artifact files. Every served file matched the local `dist/` candidate by SHA-256 and byte length:

`dist/assets/index-SPeReUdF.css`, `dist/assets/index-bhbiEgeE.js`, `dist/assets/index-bhbiEgeE.js.map`, `dist/icon.svg`, `dist/index.html`, `dist/manifest.webmanifest`, `dist/recovery.html`, and `dist/sw.js` — `8/8` exact matches.

The Pages workflow smoke-tested the published build entry. The deployed app is the current compact-default shell containing the typed launchpad owner increment; no legacy `master:/` source is accepted.

## Limitations

This receipt proves deployment identity and static smoke only. Rollback, Safari/WebKit, Firefox, assistive technology, touch hardware, offline/update interruption, quota/corruption/migration injection, cross-origin Vault restore, security/egress, and human acceptance remain open. Release status remains `NOT_RELEASE_READY`.
