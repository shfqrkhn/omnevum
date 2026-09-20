# v0.18.0 GitHub Pages deployment and live smoke receipt

- Date: 2026-09-19 (America/Toronto)
- Source revision: `d3dc92bf312da491293ea7e00198b465e1e22b6c`
- Deployment URL: [https://shfqrkhn.github.io/omnevum/](https://shfqrkhn.github.io/omnevum/)
- Pages workflow: [run 35479571937](https://github.com/shfqrkhn/omnevum/actions/runs/35479571937)
- Repository CI: green for the same source revision; Pages build and deploy jobs both succeeded
- Artifact digest: `e019fb357b34bfcccdd975f11907c2d2682b74620f1379fe59e8044ee74c6cc2`
- Service-worker cache: `omnevum-shell-0185ac748cc5a004`

## Deployment proof

- `Invoke-WebRequest` returned HTTP `200` for the HTTPS deployment.
- Served `dist/` files were compared against the locally built candidate: all 8 files returned HTTP `200` and matched SHA-256 and byte length exactly.
- The live Codex Chromium tab loaded the deployed shell with the expected title, compact density, relative manifest, navigation, main content, and Recovery surface.
- At `390x844` (`clientWidth=375`), the live page had `scrollWidth=375`, so no horizontal overflow was observed.

## Live flow proof

- Capture created one canonical record and one inbox item.
- Triage marked it reviewed; the canonical record remained and inbox count became zero.
- Search for `Live Pages smoke` returned `1 result(s); derived index healthy.`
- Vault export reported `1 record(s), 0 artifact payload(s), 2700 bytes.`

## Limitations

This is a hosted deployment and smoke receipt, not a release PASS. Rollback, Safari/WebKit, Firefox, assistive technology, touch hardware, offline/update interruption, quota/corruption/migration injection, cross-origin Vault restore, security/egress, and human acceptance remain open. Keep Phase 0 `IN_PROGRESS` and all acceptance scenarios `UNKNOWN` until independently proven.
