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

## Follow-up canonical-lens identity qualification

The runtime candidate remains commit `750c41f19fbfbce5a4bcb2edcb50a7a9f545ef88` (`750c41f`); executable proof was strengthened in test-only commit `979bb2b9aec137af9c61332401ad698e55c0a63d` (`979bb2b`). The test-only change does not alter the production bundle. Target: `http://127.0.0.1:4180/`, production `dist` served by the running Vite preview; Codex in-app Chromium tab `54`, isolated local-origin storage, 2026-09-20.

- With the Direction lens active, the visible task `Second task for relation` exposed `data-lens-record-id=record_68b2b852-1619-4d19-96a2-f38c97082b8d`.
- With the Self lens active, the same task exposed the identical canonical record ID, alongside the separate note record. The lens rows exposed only `Open record`; opening the task used the canonical detail owner (`Lenses / Self / core.task`) rather than a lens-local editor.
- `src/core/lenses.ts` projects by filtering and sorting `CanonicalRecord` references. `src/core/lenses.test.ts` now asserts both deterministic lens membership and object identity (`toBe(shared)`) for Direction and Work; the focused suite passed 3/3 tests.

This is exact evidence for OMN-ACC-007: the same canonical record is reused across authorized projections without an unsynchronized writable copy. Scope remains the exercised Chromium/local target; it does not claim Firefox/WebKit, assistive-technology, or human acceptance coverage for unrelated scenarios.

## Pages verification for the canonical-lens increment

Repository commit `54ce8e84dec3bee6792842120c55a6fd6e7ca690` passed CI workflow `35496441891` and Pages workflow `35496441789`. An independent Node HTTPS probe of `https://shfqrkhn.github.io/omnevum/` fetched all 10 published paths with HTTP 200; every local byte sequence matched its hosted counterpart, and the aggregate artifact digest was `f9c5bb9c3cf91721d0abbb16c09c48c1d94f5f03c4ff2f4bde7762f709e295d2` with service-worker cache `omnevum-shell-e5a581ec34b80448`. The test-only lens proof changes no production bundle. This proves deployment identity only; rollback, browser-family, security/egress, assistive technology, and human acceptance remain open.

## Capability fault-boundary qualification

Test commit `9268cb3e84ac4f1ecc88a369fee72c6550b71ca4` strengthens the first-party capability-runtime proof. `npm test -- --run src/core/capability-runtime.test.ts` passed 1 file and 5 tests.

- Startup fixture: critical `core.home` and `core.recovery` start successfully while an optional parser throws; the failed module is isolated as `DEGRADED` with a bounded visible reason, and both critical modules remain `READY`.
- Runtime fixture: `core.search` fails during an operation and becomes `DEGRADED`; `core.home` and `core.recovery` continue to execute successfully. Credential-shaped failure text is redacted, and a repaired capability can be retried to `READY`.

This is bounded implementation/runtime evidence for OMN-ACC-016, promoted to `PARTIAL`: the independent capability boundary is executable and fail-closed, while injection of a production module fault, browser-family behavior, assistive technology, and human acceptance remain open.

## Pages verification for the capability fault-boundary increment

Commit `764c8cd98f71429111297929479f2c1953772625` passed CI workflow `35496653956` and Pages workflow `35496653998`. An independent HTTPS probe fetched all 10 published paths from `https://shfqrkhn.github.io/omnevum/` with HTTP 200 and matched every local byte sequence; the aggregate artifact digest remained `f9c5bb9c3cf91721d0abbb16c09c48c1d94f5f03c4ff2f4bde7762f709e295d2`, with service-worker cache `omnevum-shell-e5a581ec34b80448`. The capability test is test-only and does not change the production bundle. This refreshes deployment identity only; production rollback, browser-family, security/egress, assistive technology, and human acceptance remain open.

## Canonical History/Version browser qualification

Target: `http://127.0.0.1:4180/`, production `dist` served by the running Vite preview; Codex in-app Chromium tab `54`, isolated local-origin storage, compact density, 2026-09-20. The focused `src/core/history.test.ts` suite passed 1 file and 2 tests.

- An explicit safe-route Capture created canonical record `record_aba7672c-74ee-4109-986f-4bd801c2e19e` owned by `core.knowledge`, revision 1.
- The canonical detail editor changed its text through the owning command path, producing revision 2 and an explicit notice that the derived Search index was degraded rather than silently assumed healthy.
- Recovery > Repair search index rebuilt only derived state. Search then exposed revision history with field-level changes and a visible `Revert to revision 1` action.
- Reverting produced revision 3 with the original text; the visible history retained revisions 1, 2, and 3, and the record remained one canonical result with no lens-local writable copy. The detail breadcrumb remained `Lenses / Self / core.knowledge`.

This is bounded `PARTIAL` evidence for OMN-ACC-047: meaningful edit history, diff visibility, canonical-owner revert, and derived-index honesty are proven in Chromium. Deletion-specific retention/resurrection policy, other browser families, assistive technology, and human acceptance remain open.

## Compose/View browser qualification

Repository candidate `2f6ea95326e1dcf4acf7dafbd121bc71f643e6de`; target `http://127.0.0.1:4180/`, production `dist` served by the running Vite preview; Codex in-app Chromium tab `54`, isolated local-origin storage, 2026-09-20. The focused `src/core/compose.test.ts` suite passed 1 file and 5 tests.

- Personalization enabled the optional Compose / View route; the default compact navigation stayed closed until explicitly expanded, keeping this low-frequency surface out of the default scroll path.
- A user dashboard titled `Compact QA dashboard`, scoped to Personal, rendered the declarative Capture, Records list, Table, and descriptive Chart widgets over 3 existing canonical records. The UI reported `Saved a reusable view; canonical records were not changed.`
- After reload, the saved view and optional route remained present and the same projection rendered. At emulated 390x844 CSS pixels with DPR 2, the Compose surface retained `scrollWidth === clientWidth === 390`; the rendered table did not introduce horizontal overflow.
- `src/core/compose.ts` validates bounded safe field paths, persists only the view definition in `ViewRegistry`, and projects records without taking canonical ownership; the test suite covers validation, unsafe-field rejection, persistence, Vault round-trip of view state, and canonical-store non-ownership.

This is bounded `PARTIAL` evidence for OMN-ACC-048: declarative multi-widget composition, canonical non-ownership, reload persistence, and compact-width behavior are proven in Chromium. Full touch/keyboard/accessibility/theme/localization qualification, update migration, other browser families, and human acceptance remain open.

## Capture → Acquire → Triage browser qualification

Source candidate: commit `3b3bfb6df6f1c96e74fb144893da9a2a06f0edde` (`3b3bfb6`); target `http://127.0.0.1:4180/`, production `dist` served by the running Vite preview; Codex in-app Chromium tab `54`, isolated local-origin storage, compact density, 2026-09-20. Focused Acquire/CommandBus tests passed 2 files and 21 tests.

- An ambiguous mixed plain-text source, `Maybe reconcile this mixed item with a household task and expense: History QA triage 2026-09-20`, was staged through Acquire before canonical creation. The UI reported one staged candidate and rendered its proposed Note result; Accept staged then imported exactly one record and raised the inbox count to one.
- The visible Triage route showed the item as `in inbox`, preserved `Source IMPORT`, the capture timestamp, owner `core.acquire`, revision 1, and the source fingerprint. Its proposal explicitly listed possible owners (`core.acquire`, `core.capture`), possible types (`Note`, `Task`), and admitted actions while stating that no canonical state had changed.
- The item was resolved through the explicit `Keep as reference` command. The inbox returned to zero, the canonical count became four, and the record remained a single `IMPORTED_RECORD` with canonical ID `record_56a30a3e-1f9f-48ff-b790-38b02f4fd662`, owner `core.acquire`, truth class `IMPORTED_RECORD`, sensitivity `PRIVATE`, and provenance `IMPORT / source:b7ef2e63952481b05387bc2db60d20160bcc6b4e2fa343898e4a44f1ce9c8543:1`.
- Canonical Records showed revision 2 with only the triage disposition/status mutation; no lens-local writable copy or duplicate result appeared. The compact route stayed closed until explicitly navigated, and no console error was observed during this flow.

This is bounded `PARTIAL` evidence for OMN-ACC-065: raw/provenance preservation, proposal-only routing, explicit inbox resolution, canonical ownership, and no-duplicate behavior are proven in Chromium. Full split/link/route/defer/delete matrix coverage, safe-route capture in the same receipt, other browser families, assistive technology, fault/reload breadth, and human acceptance remain open; no release or `100_PERCENT_COMPLETE` claim is made.

## Compact Home disclosure qualification

Source candidate: commit `4449031d37c98428fe73373ca1c7866df0c72e48` (`4449031`); local production build served at `http://127.0.0.1:4180/`; Codex in-app Chromium hidden QA tab `55`, isolated local-origin profile, 320x800 CSS pixels, DPR 1, touch emulation, compact density, 2026-09-20. Focused presentation/style tests passed 2 files and 18 tests; the subsequent full local `npm run ci` passed 388 tests with 1 skipped test.

- The candidate changes compact Home progressive disclosure so populated Insights and Considerations remain closed by default, while explicit expansion remains one-tap reachable and comfortable density retains its intentional surfaced behavior. The same candidate also keeps compact disclosure summaries horizontal at narrow widths instead of applying the generic mobile stacked heading layout.
- Before/after diagnostic comparison on the same compact 320px profile: the pre-fix baseline measured `scrollHeight=3343`, with Home Insights and Considerations open at approximately 381px and 462px; the candidate measured `scrollHeight=2665`, `scrollWidth=320`, `clientWidth=320`, and zero visible controls below 44px. Candidate closed-widget heights were approximately 73px and 91px. This is a 678px reduction in initial scroll extent; the baseline is diagnostic context, not a release target.
- Tapping both Home summaries opened their complete content without overflow; reloading compact restored both closed. Switching to comfortable, reloading, and returning to compact confirmed density-specific behavior. No console errors were observed. All disclosure content remained reachable without relying on hidden or duplicate owners.

This receipt bounds `PARTIAL` evidence for compact progressive disclosure and responsive presentation, including OMN-ACC-099's Chromium layout portion. It does not promote any row to `PASS`: native touch hardware, keyboard/assistive technology, WebKit/Firefox, all required text-scale/viewport variants, and human acceptance remain open. The candidate was deployed by Pages workflow `35497600224` after CI workflow `35497600208`; independent HTTPS verification matched all 10 public paths byte-for-byte to artifact `523f2095f75a28de187a78abbbd4627c0b377de24e50f14a1f70728f6d5b0c0b` with service-worker cache `omnevum-shell-58d4d34fe0a37792`.
