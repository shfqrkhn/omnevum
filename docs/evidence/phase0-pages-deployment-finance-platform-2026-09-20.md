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
