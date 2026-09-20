# Phase 0 Pages deployment receipt for the current Finance/platform candidate

Date: 2026-09-20

- Source candidate: `bc6b32a6ebd52e9a795f71d2913f1f33899f2c99` (`bc6b32a`), published by trigger commit `9284f4807718fdcb8806eab86f719419f820caef`.
- CI workflow: [35492113341](https://github.com/shfqrkhn/omnevum/actions/runs/35492113341), success.
- Pages workflow: [35492113413](https://github.com/shfqrkhn/omnevum/actions/runs/35492113413), success.
- Target: `https://shfqrkhn.github.io/omnevum/`.
- Artifact digest: `90ff59b7dd66e0dba9f7acd6927b3e3d5fcaf679363aac763dda52af337d8710`.
- Service-worker cache: `omnevum-shell-f91483fea7635266`.

An independent Node HTTPS probe fetched the ten control-bound public paths (`index.html`, CSS, JavaScript, source map, icon, manifest, recovery route, crawler metadata, and `sw.js`). Every response was HTTP 200 and every served byte length and SHA-256 matched `docs/control/release-evidence.json`; the recomputed served aggregate digest was exactly `90ff59b7dd66e0dba9f7acd6927b3e3d5fcaf679363aac763dda52af337d8710`.

An isolated Chromium spot check against the same deployed URL at 390x844 CSS pixels, DPR 2, touch, and dark mode found zero horizontal overflow, zero visible controls below 44 CSS pixels, zero controls missing both `id` and `name`, zero console messages, and Lighthouse Accessibility, Best Practices, SEO, and Agentic Browsing scores of 100. The deployed search-degraded preview began at `LOCAL - 1 degraded`; its repair action rebuilt the index to healthy `LOCAL` state. No user browser context was used.

This is exact deployment and artifact identity evidence only. It does not prove rollback, response-header control, WebKit/Firefox behavior, real quota/process faults, cross-browser Vault restore, security/egress, assistive technology, or human acceptance. Release readiness and `100_PERCENT_COMPLETE` remain unclaimed.

## Current launchpad-transplant deployment supersession

- Source candidate: `aca722b568008a526b25287fb61e44ebbf509b0e` (`aca722b`), published by trigger commit `d7bb5ea506c9a0b012882d194485d7e3e53b7794`.
- CI workflow: [35492717331](https://github.com/shfqrkhn/omnevum/actions/runs/35492717331), success.
- Pages workflow: [35492717257](https://github.com/shfqrkhn/omnevum/actions/runs/35492717257), success.
- Artifact digest: `a5ab8f3d6e15fb82f502036925a6e4474ac51539d2589e02b3045f72e63be1ce`.
- Service-worker cache: `omnevum-shell-318ce7c54643a886`.

An independent Node HTTPS probe fetched the same ten public paths. Every response
was HTTP 200 and every served byte length and SHA-256 matched the rebuilt local
candidate exactly (`10/10`); the served aggregate digest was
`a5ab8f3d6e15fb82f502036925a6e4474ac51539d2589e02b3045f72e63be1ce`.

The deployment remains subject to the limitations above; this observation does
not close rollback, response-header, browser-family, fault, security/egress,
assistive-technology, human-acceptance, or 100% gates.

## Current Finance transaction-boundary deployment supersession

- Source candidate: `2e675def894e2cfd2c2eb5df5804a252e585d7a9` (`2e675de`), published by trigger commit `5e30b25452b56d5652d5f10fd5e59cd8f2cda3e0` (`5e30b25`).
- CI workflow: [35493389987](https://github.com/shfqrkhn/omnevum/actions/runs/35493389987), success.
- Pages workflow: [35493389977](https://github.com/shfqrkhn/omnevum/actions/runs/35493389977), success.
- Target: `https://shfqrkhn.github.io/omnevum/`.
- Artifact digest: `359ece9af38fb8ef214f5a9e0e9c0dbb574bd2bbdfe8021974f1addd465705d7`.
- Service-worker cache: `omnevum-shell-99a4e4d7c73d5c05`.

An independent Node/.NET HTTPS probe fetched the ten control-bound public paths. Every response was HTTP 200 and every served byte length and SHA-256 matched the local receipt-bound candidate exactly (`10/10`); the served aggregate digest was exactly `359ece9af38fb8ef214f5a9e0e9c0dbb574bd2bbdfe8021974f1addd465705d7`.

This exact deployment identity does not prove rollback, response-header control, WebKit/Firefox behavior, real quota/process faults, cross-origin Vault restore, security/egress, assistive technology, human acceptance, or `100_PERCENT_COMPLETE`; those gates remain open.

## Current compact-layout deployment supersession

- Source candidate: `dab22db0be786ad2ec703080167ef185273065ca` (`dab22db`), published by trigger commit `e72d42b3eb34124b046951cd13b10530a1ab2c49` (`e72d42b`).
- CI workflow: [35493877687](https://github.com/shfqrkhn/omnevum/actions/runs/35493877687), success.
- Pages workflow: [35493877707](https://github.com/shfqrkhn/omnevum/actions/runs/35493877707), success.
- Target: `https://shfqrkhn.github.io/omnevum/`.
- Artifact digest: `bd91504e93748b2ebbb7f79284c05cefba6f98d3df775f2716316d1640a0d3a2`.
- Service-worker cache: `omnevum-shell-afe1549926e7d002`.

An independent HTTPS probe fetched the ten control-bound public paths. Every response was HTTP 200 and every served byte length and SHA-256 matched the local receipt-bound candidate exactly (`10/10`); the served aggregate digest was exactly `bd91504e93748b2ebbb7f79284c05cefba6f98d3df775f2716316d1640a0d3a2`.

The candidate tightens the compact-default mobile layout: low-frequency empty Considerations content is a progressive disclosure that remains closed until material attention exists or the user opens it, and Capture type/space selectors share a two-column choice grid while retaining their semantic labels and control identities. Source/style tests and the full local CI gate passed. This is implementation, artifact, and deployment identity evidence only; it does not prove rollback, response-header control, WebKit/Firefox behavior, real quota/process faults, cross-origin Vault restore, security/egress, assistive technology, human acceptance, or `100_PERCENT_COMPLETE`.

## Current durable parser/migration and compact-layout deployment supersession

- Source candidate: `76071c8bbe6ca9bf80e250200149d0f591e3f4ac` (`76071c8`), published by the documentation receipt trigger commit `744d95de0c9de45299838dac14e56c5e3bfabaee`; CI workflow [35495278619](https://github.com/shfqrkhn/omnevum/actions/runs/35495278619), success; Pages workflow [35495278594](https://github.com/shfqrkhn/omnevum/actions/runs/35495278594), success.
- Target: `https://shfqrkhn.github.io/omnevum/`.
- Artifact digest: `2470b25ef82625c14a560a4d98d9def00537aa80360e92256dacd07c9a29b7be`.
- Service-worker cache: `omnevum-shell-295d2a37beaec3e0`.

An independent Node HTTPS probe fetched all ten control-bound public paths. Every response was HTTP 200 and matched the receipt-bound local artifact by exact SHA-256 and byte length (`10/10`); the served aggregate digest was exactly `2470b25ef82625c14a560a4d98d9def00537aa80360e92256dacd07c9a29b7be`.

Live Chromium verification at the deployed target confirmed compact density, closed low-frequency sections by default, and zero console errors. The observed Domains discrepancy was a pending presentation form edit, not a rendering defect: after saving the visible Domains option, the `#domains` section became visible as a collapsed disclosure and the `#domains` navigation link appeared. This preserves compact-by-default behavior while making the selected section reachable. The durable parser-profile and fingerprint-bound migration/recovery runtime, source tests, full local CI, and deployment identity are current at this candidate.

This receipt remains `PASS_WITH_LIMITATIONS`; it does not prove production rollback, real offline/update/fault qualification, WebKit/Firefox, assistive technology, cross-origin Vault restore, security/egress, human acceptance, or `100_PERCENT_COMPLETE`.
