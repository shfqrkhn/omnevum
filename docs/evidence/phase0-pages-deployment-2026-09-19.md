# v0.18.0 GitHub Pages deployment and live smoke receipt

- Date: 2026-09-19 (America/Toronto)
- Source revision: `542b665b361d579ee6d8e3ab2f331ce3afca5cd6`
- Deployment URL: [https://shfqrkhn.github.io/omnevum/](https://shfqrkhn.github.io/omnevum/)
- Repository CI: [run 35481320595](https://github.com/shfqrkhn/omnevum/actions/runs/35481320595) succeeded for the source revision
- Pages build/deploy workflow: [run 35481320651](https://github.com/shfqrkhn/omnevum/actions/runs/35481320651) succeeded, including the published-entry smoke guard
- Artifact digest: `03a6eb2e8c3bbfdac6cc29c0abfa1210e7cfddd76062195874f543881ddf47aa`
- Service-worker cache: `omnevum-shell-4b0fcf7bba597af9`

## Deployment proof

- Pages was explicitly changed from the legacy `master:/` source to the GitHub Actions artifact source before this proof; the legacy source had served the unbuilt repository entry and is not accepted.
- `Invoke-WebRequest` returned HTTP `200` for the deployed root and all eight expected artifact files.
- Served `dist/` files were compared against the locally built candidate: all 8 files matched SHA-256 and byte length exactly.
- The live Codex Chromium tab loaded the deployed shell with the expected title, compact density, relative manifest, navigation, main content, and Recovery surface.
- At `390x844`, `768x1024`, `1280x800`, and `1440x900`, every tested row retained compact density and `scrollWidth === clientWidth`; no horizontal overflow was observed.

## Live flow proof

- Capture created one canonical record and one inbox item.
- Triage marked it reviewed; the canonical record remained and inbox count became zero.
- Search for `Live Pages smoke` returned `1 result(s); derived index healthy.`
- Vault export reported `1 record(s), 0 artifact payload(s), 2700 bytes.`

## Limitations

This is a hosted deployment and smoke receipt, not a release PASS. Rollback, Safari/WebKit, Firefox, assistive technology, touch hardware, offline/update interruption, quota/corruption/migration injection, cross-origin Vault restore, security/egress, and human acceptance remain open. Keep Phase 0 `IN_PROGRESS` and all acceptance scenarios release-visible until independently proven.
