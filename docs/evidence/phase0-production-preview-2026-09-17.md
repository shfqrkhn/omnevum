# Phase 0 production-preview receipt

Date: 2026-09-17  
Status: PARTIAL; local Vite preview only, not a deployed static-host or cross-browser claim

## Environment

- Artifact: current `npm run build` output served by `npm run preview -- --host 127.0.0.1 --port 4173`
- Browser surface: Codex In-app Browser
- Test data: synthetic observation `static preview smoke`

## Initial observed

- The production-built shell loaded at `/` with the same labelled sections and controls as the development smoke.
- An observation was created and displayed with owner `core.capture`, revision `1`.
- Reload preserved the observation in the production preview origin.
- No warning or error entries were returned by the browser console inspection.

## Phase 0 follow-up run

The same production preview was reloaded through the browser automation surface at an explicit `390x844` viewport. The accessibility tree retained labelled headings, landmark sections, form labels, status content, native controls, and the full core workflow surface. A `Tab` action placed focus on the theme control, confirming keyboard focus reached a labelled interactive element at the mobile viewport.

The live PWA state was inspected before the offline test:

- Service worker: `http://127.0.0.1:4173/sw.js`, scope `http://127.0.0.1:4173/`, state `activated`, page controlled: `true`.
- Cache (pre-hardening run): `omnevum-shell-v1`; the current preview root, JavaScript asset `index-BKKgSl5J.js`, and CSS asset `index-DId-fK--.css` were present.
- Browser warnings/errors: none returned by the production-preview console inspection.

Network was then emulated offline, the page was reloaded, and the accessibility tree again exposed the complete shell and core controls. The preserved synthetic state remained `6` active records, `0` archived records, `7` revisions, `1` artifact, and a healthy derived index. Network emulation and the temporary viewport override were reset after the run.

## Fresh-origin offline workflow

To avoid relying on the existing preview profile, the same built `dist/` directory was served on the separate local static origin `http://127.0.0.1:4174/`. The fresh origin registered and activated `sw.js`, then an initial synthetic note was created online. With network emulation disabled, the page reloaded from the cached shell and the note was still visible; a second synthetic note was created while offline. After network restoration and another reload, both notes remained present as canonical records with a healthy search index. No personal data was used.

This is a local static-origin offline mutation/reload receipt. It is not evidence for GitHub Pages, other browser families, service-worker update/rollback, or the full acceptance scenario's explicit degradation behavior.

## Stamped-worker follow-up

After the service-worker cache-identity hardening, `npm run build` produced cache identity `omnevum-shell-e4428b7e0470f612`. On the fresh `4174` origin, the new worker became `activated`, retired the prior `omnevum-shell-v1` cache, and retained the current root, CSS, and JavaScript assets. With network emulation disabled, the shell reloaded and accepted `Stamped worker offline capture`; network restoration and reload preserved three canonical notes and a healthy derived index.

## Acquire/Input follow-up

After the bounded Device/Input integration build (`npm run build`, cache identity `omnevum-shell-c687d0d941bd37ea`), the fresh local static origin exposed file and clipboard routes in the Acquire surface. A local `README.md` fixture selected through the file control produced one staged `HIGH` candidate, and accepting it created one canonical `core.acquire` record with the existing command/provenance path. A synthetic clipboard value produced one staged `HIGH` candidate through the same preview path. The browser console returned no warning or error entries after these interactions.

The Device/Input broker now bounds clipboard text and file blobs at 5 MiB before Acquire sees them; the unit suite covers the boundary. This proves only the local Chromium static-preview fallback routes. It does not qualify share-target delivery, other browser families, permissions, camera/microphone/location, parser breadth, or production deployment.

## Service-worker update/rollback rehearsal

The tracked local harness `node scripts/service-worker-rehearsal-server.mjs --old-ref 5ca1f9c --port 4177` served the prior worker and current built assets on a fresh origin. After one controlled reload primed the old `omnevum-shell-v1` root/CSS/JavaScript cache, switching the harness to `new` and calling the registration update activated `omnevum-shell-6de4daa99184cc32`. The new worker precached all seven built entries and wrote history `["omnevum-shell-6de4daa99184cc32", "omnevum-shell-v1"]`.

Switching the harness back to `old` and updating again reactivated `v1`, removed the newer shell cache, and left the old root/CSS/JavaScript entries usable. With the network emulated offline, the rolled-back shell reloaded, accepted `script rollback offline capture`, and retained it after network restoration. Browser error/warning inspection remained empty. This is a local static Chromium lifecycle rehearsal; it does not prove a GitHub Pages rollout/rollback, browser-family support, release promotion, or human acceptance.

## Storage fault/recovery follow-up

The canonical-store fault seam now exercises two bounded Phase 0 failure modes under Vitest/fake-indexeddb. A malformed derived search document is injected while its metadata claims validity; `getSearchHealth()` reports `MALFORMED`, the normal search owner rebuilds the derived index, and the canonical record remains unchanged. A deterministic 90/100 storage estimate is injected; health reports `ELEVATED`, derived search state is reclaimed, canonical records remain readable, persistence state is exposed, and the UI health copy directs the user toward Vault export. The full run passes `40` test files and `108` tests.

This is deterministic local fault evidence, not a claim that a real browser quota exhaustion or canonical-store corruption was observed. Native browser quota behavior, interrupted canonical migration, cross-browser recovery, and production support remain open.

## Untrusted Acquire follow-up

Acquire now rejects non-HTTP(S), over-4 KiB, and embedded-credential URLs before staging. The unit path also feeds HTML-looking text plus an `accessToken` field through JSON staging and verifies that the text remains data while the secret-shaped field is removed from retained source fields. This proves the bounded Acquire/parser boundary only; broader sanitizer/active-content, artifact-rendering, external-egress, dependency, and production security qualification remain open.

## Diagnostics follow-up

The privacy-minimized diagnostics export now reports explicit category states for release identity, storage/database/schema versions and pressure, persistence, backup exportability versus unknown off-origin status, service-worker control/update state when the browser supplies it, package-integrity evidence, connectors, and sync. A test fixture verifies that category diagnostics do not include canonical record content. Runtime placeholders remain `NOT_PROVIDED`, `NONE_ADMITTED`, or `CONTRACT_ONLY`; they are not release evidence.

## Current-build browser follow-up

The current `npm run ci` artifact (`omnevum-shell-30a45ac985e813bc`, source revision `5e6881a`) was served on the local static preview `http://127.0.0.1:4175/`. In the browser, Acquire staged the synthetic payload `<img src=x onerror=alert(1)>` as visible literal text; after acceptance the same literal remained in review, selectors, and the canonical record list, with no active markup surface observed. The Export diagnostics control completed and displayed the privacy-minimized status. This is a local Chromium observation using synthetic data, not sanitizer, assistive-technology, cross-browser, or production-host evidence.

## Limits

This receipt establishes only a local production-preview activation/offline-reload and update/rollback rehearsal at one Chromium-based browser surface and one mobile viewport, plus deterministic storage fault tests. It does not establish GitHub Pages routing, browser-family support, full responsive/accessibility conformance, native browser quota exhaustion, interrupted canonical migration, or release readiness. Those remain open in the support, risk, and completion registers.
