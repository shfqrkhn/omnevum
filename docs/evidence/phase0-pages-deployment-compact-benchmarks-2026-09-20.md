# v0.18.0 compact mobile and benchmark Pages deployment receipt

- Date: 2026-09-20
- Baseline: `docs/Omnevum-MPES-v0_18_0.md` SHA-256 `103d84308887da9f2eb73caf7eccabb0f68fd14e7c00f876911c9700c15096c8`
- Pages target: `https://shfqrkhn.github.io/omnevum/`
- Trigger commit: `bdca985a943f20f00d80bc6a07f2a331273a2300`
- Artifact source revision: `0c83e8d7050dce0276eab01b9c7609387f3fc57e`
- CI workflow: [35490942780](https://github.com/shfqrkhn/omnevum/actions/runs/35490942780) — success
- Pages workflow: [35490942760](https://github.com/shfqrkhn/omnevum/actions/runs/35490942760) — success; build and published-entry smoke test passed

## Independent byte probe

At 2026-09-20, a fresh Node HTTPS fetch compared every release-register artifact against the local `dist/` bytes. All ten paths returned HTTP 200, identical byte length, and identical SHA-256:

`assets/index-Bzh0zw-4.css`, `assets/index-B-3V5X4c.js`, `assets/index-B-3V5X4c.js.map`, `icon.svg`, `index.html`, `llms.txt`, `manifest.webmanifest`, `recovery.html`, `robots.txt`, and `sw.js`.

- Artifact digest: `8cea52243b018b1c6afeba14ff2ad431658b17bcd8f26f3a1c376e3832465d96`
- Service-worker cache: `omnevum-shell-db998bd1a51f7215`
- Probe result: `10/10 PASS`

This proves deployment identity and transport integrity only. It does not close production rollback, offline/update, storage fault, browser-family, security, assistive-technology, or human-acceptance gates.

## Hosted mobile browser qualification

After deployment, Chrome DevTools reloaded the hosted route in an isolated context at `390x844`, DPR 2, touch enabled, light color scheme. Navigation Lighthouse reported Accessibility 100, Best Practices 100, SEO 100, and Agentic Browsing 100; all 52 reported audits passed. The console contained no messages. This confirms the compact default presentation and hosted browser hygiene at this target profile; other engines, assistive technology, broader responsive matrices, and human acceptance remain open.
