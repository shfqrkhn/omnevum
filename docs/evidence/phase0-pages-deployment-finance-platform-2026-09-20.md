# Phase 0 Pages deployment receipt for the current Finance/platform candidate

Date: 2026-09-20

- Source candidate: `bc6b32a6ebd52e9a795f71d2913f1f33899f2c99` (`bc6b32a`), published by trigger commit `9284f4807718fdcb8806eab86f719419f820caef`.
- CI workflow: [35492113341](https://github.com/shfqrkhn/omnevum/actions/runs/35492113341), success.
- Pages workflow: [35492113413](https://github.com/shfqrkhn/omnevum/actions/runs/35492113413), success.
- Target: `https://shfqrkhn.github.io/omnevum/`.
- Artifact digest: `90ff59b7dd66e0dba9f7acd6927b3e3d5fcaf679363aac763dda52af337d8710`.
- Service-worker cache: `omnevum-shell-f91483fea7635266`.

An independent Node HTTPS probe fetched the ten control-bound public paths (`index.html`, CSS, JavaScript, source map, icon, manifest, recovery route, crawler metadata, and `sw.js`). Every response was HTTP 200 and every served byte length and SHA-256 matched `docs/control/release-evidence.json`; the recomputed served aggregate digest was exactly `90ff59b7dd66e0dba9f7acd6927b3e3d5fcaf679363aac763dda52af337d8710`.

This is exact deployment and artifact identity evidence only. It does not prove rollback, response-header control, WebKit/Firefox behavior, real quota/process faults, cross-browser Vault restore, security/egress, assistive technology, or human acceptance. Release readiness and `100_PERCENT_COMPLETE` remain unclaimed.
