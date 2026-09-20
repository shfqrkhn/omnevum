# Phase 0 current Finance, platform-recovery, and compact-browser increment

Date: 2026-09-20

This receipt is bound to the v0.18.0 baseline (`docs/Omnevum-MPES-v0_18_0.md`, MPES SHA-256 `103d84308887da9f2eb73caf7eccabb0f68fd14e7c00f876911c9700c15096c8`) and Omni doctrine `docs/Omni_3.32.0.md`. The source candidate is commit `bc6b32a6ebd52e9a795f71d2913f1f33899f2c99` (`bc6b32a`), with Finance scenario work at `41bbea92bc509bd270b7e07cc3a349ebba3e5f5a` and the platform-recovery benchmark at `99d2610cf1c8fa9ce9756509472aace92756eb62`.

## Source-contract verification

- `npm run benchmark:finance-phase4`: `PASS`; all thirteen source-contract rows OMN-ACC-159..171 exercised. The fixture retained shared-resource ownership, authorized cross-domain projections, graph quarantine/convergence, transfer pairing/unresolved review, forecast-vintage actualization, anomaly confidence, and scoped legitimacy review. Familiarity/authentication never became proof of legitimacy; possible scam/coercion remained urgent and distinct.
- Focused Finance tests: 2 files, 32 tests passed; `npm run typecheck` passed; `git diff --check` passed.
- `node scripts/platform-recovery-benchmark.mjs`: `PLATFORM_RECOVERY_BENCHMARK_PASS`, 23 checks. It covers deterministic quota-pressure reclamation with canonical preservation, interrupted migration/stale-client fencing, update approval/rollback paths, Vault integrity/idempotent import/tamper rejection, invalid-profile Safe Mode, and static-host boundaries. Its limitations remain synthetic fake-IndexedDB/source-contract coverage, not real quota, crash, browser-family, live-header, or human proof.
- `npm run build`: passed. Exact local artifact identity at this receipt: artifact digest `90ff59b7dd66e0dba9f7acd6927b3e3d5fcaf679363aac763dda52af337d8710`; service-worker cache `omnevum-shell-f91483fea7635266`.

## Current local browser qualification

Target: production build served by `npm run preview -- --host 0.0.0.0 --port 4176`; Chromium DevTools isolated context `omn-phase0-current`; no user browser storage or tabs were used.

- 390x844 CSS pixels, DPR 2, touch, dark: zero horizontal overflow; zero visible controls below 44 CSS pixels; zero form controls missing both `id` and `name`; 21 visible controls; compact disclosures closed by default; Lighthouse Accessibility, Best Practices, SEO, and Agentic Browsing each scored 100; console had no messages.
- 320x800 CSS pixels, DPR 1, touch, text scale 200%, large targets, compact density: zero horizontal overflow, zero under-44 visible controls, zero missing field identities. Alpha, Beta, and Gamma each passed the same dark-mode matrix, then each passed the light-mode matrix.
- 1280x900 CSS pixels, DPR 1, pointer: zero horizontal overflow, zero under-44 visible controls, zero missing field identities.
- Search-degraded preview began as `LOCAL - 1 degraded` / `index degrade`; the user-facing repair action rebuilt the derived index to `LOCAL` / `index sain`, and a search returned one canonical record. The generated triage/presentation controls now carry stable identities and names, removing the browser autofill/accessibility issue found during QA.
- A malformed persisted presentation profile (`schemaVersion: 999`, invalid family/theme/locale/navigation) was recovered in Safe Presentation Mode to compact Gamma defaults while the malformed setting and canonical record `record_7bd0cd54-1104-4569-ae33-69eedd63f5c0` remained intact. The valid profile was restored afterward.
- The current service worker activated with cache `omnevum-shell-f91483fea7635266`; under DevTools Offline emulation, reload served the built app with its heading, Search, and canonical record still available. Network emulation did not reliably change `navigator.onLine`, so this receipt claims cached offline reload only, not an online-state API claim.

## Qualification boundary

This receipt supports bounded `PARTIAL` evidence for the covered presentation, offline-core, static-host, Safe Mode, browser-layout, personalization, ordinary-use, and Finance source-contract rows. It does not claim release readiness or `PASS`: Firefox and WebKit rows, real assistive technology, real quota/eviction/corruption/process interruption, production rollback, cross-origin Vault restore on a materially different browser family, live security/egress/header behavior, full Finance UI/statement coverage, and human acceptance remain open. No `100_PERCENT_COMPLETE` claim is made.

## Follow-up compact/search qualification

The follow-up source candidate is commit `adababe663b190b65b04d859f89c68eaf7b2bd13` (`adababe`), built locally with `npm run build`. The candidate artifact digest is `f9c5bb9c3cf91721d0abbb16c09c48c1d94f5f03c4ff2f4bde7762f709e295d2`; service-worker cache is `omnevum-shell-e5a581ec34b80448`. This local receipt is not a hosted-deployment claim.

- Target: `http://127.0.0.1:4180/`, production `dist` served by the running Vite preview; Codex in-app Chromium tab `53`, isolated local-origin storage, 2026-09-20.
- At emulated 390x844 CSS pixels, DPR 2, compact default: `document.documentElement.scrollWidth` equaled `clientWidth` (390); the closed Navigation sections disclosure rendered zero visible navigation links; no console errors were observed. Expanding the disclosure rendered all 8 configured links in a grid and retained 390px width with no horizontal overflow.
- Two local captures were batch-reviewed through the visible triage UI: status `Batch complete: 2 succeeded; 0 failed`, inbox count `0`, canonical record count `2`; no console errors were observed.
- Searching `Second task` returned `1 result(s); derived index healthy`, automatically opened the Canonical records disclosure, rendered the canonical task text, and brought the records surface into view. This fixes the prior invisible-result path when compact Records was closed.
- The existing lens interaction remained available for Direction, People, Self, and Resources; compact low-frequency sections remained collapsed by default.
- Hosted follow-up: CI workflow `35496026535` and Pages workflow `35496026549` passed for repository commit `8c4ecb1fb61d83df002ab7e84cd3b0aace864c63`; an independent HTTPS fetch matched all 10 public paths to the local candidate by HTTP 200, byte length, and SHA-256. This binds deployment identity, not rollback, cross-browser, or human acceptance.

This follow-up supports bounded `PARTIAL` evidence for compact progressive disclosure, search-result visibility, batch triage, canonical records, responsive-overflow behavior, and exact hosted artifact identity. It does not promote a row to release `PASS`: browser interaction remains one Chromium-based emulation and local preview; Firefox/WebKit, assistive technology, real touch hardware, cross-origin Vault restore, fault/rollback/update, live security/egress, and human acceptance remain open.
