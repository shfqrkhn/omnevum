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

The canonical-store fault seam now exercises two bounded Phase 0 failure modes under Vitest/fake-indexeddb. A malformed derived search document is injected while its metadata claims validity; `getSearchHealth()` reports `MALFORMED`, the normal search owner rebuilds the derived index, and the canonical record remains unchanged. A deterministic 90/100 storage estimate is injected; health reports `ELEVATED`, derived search state is reclaimed, canonical records remain readable, persistence state is exposed, and the UI health copy directs the user toward Vault export. The full run passes `40` test files and `111` tests.

This is deterministic local fault evidence, not a claim that a real browser quota exhaustion or canonical-store corruption was observed. Native browser quota behavior, interrupted canonical migration, cross-browser recovery, and production support remain open.

## Untrusted Acquire follow-up

Acquire now rejects non-HTTP(S), over-4 KiB, and embedded-credential URLs before staging. The unit path also feeds HTML-looking text plus an `accessToken` field through JSON staging and verifies that the text remains data while the secret-shaped field is removed from retained source fields. This proves the bounded Acquire/parser boundary only; broader sanitizer/active-content, artifact-rendering, external-egress, dependency, and production security qualification remain open.

## Diagnostics follow-up

The privacy-minimized diagnostics export now reports explicit category states for release identity, storage/database/schema versions and pressure, persistence, backup exportability versus unknown off-origin status, service-worker control/update state when the browser supplies it, package-integrity evidence, connectors, and sync. A test fixture verifies that category diagnostics do not include canonical record content. Runtime placeholders remain `NOT_PROVIDED`, `NONE_ADMITTED`, or `CONTRACT_ONLY`; they are not release evidence.

## Current-build browser follow-up

The current `npm run ci` artifact (`omnevum-shell-30a45ac985e813bc`, source revision `5e6881a`) was served on the local static preview `http://127.0.0.1:4175/`. In the browser, Acquire staged the synthetic payload `<img src=x onerror=alert(1)>` as visible literal text; after acceptance the same literal remained in review, selectors, and the canonical record list, with no active markup surface observed. The Export diagnostics control completed and displayed the privacy-minimized status. This is a local Chromium observation using synthetic data, not sanitizer, assistive-technology, cross-browser, or production-host evidence.

## Vault preview follow-up

`CanonicalStore.previewVault()` now performs the same Vault integrity, schema, presentation-view, revision, tombstone, and equal-revision conflict checks as import classification without writing records, history, artifacts, settings, or derived state. The regression fixture confirms an older Vault revision reports `skipped` without changing the newer local meaning. This qualifies a deterministic local dry-run seam; browser file transfer, destination-capacity checks, cross-origin restore, and materially different browser/platform evidence remain open.

## Limits

This receipt establishes only a local production-preview activation/offline-reload and update/rollback rehearsal at one Chromium-based browser surface and one mobile viewport, plus deterministic storage fault tests. It does not establish GitHub Pages routing, browser-family support, full responsive/accessibility conformance, native browser quota exhaustion, interrupted canonical migration, or release readiness. Those remain open in the support, risk, and completion registers.

## Current built-artifact integrated follow-up

The current built artifact at source revision `11ebcac` (artifact digest `b77e0d9e82c110736c0da2e4e742af5b066d8f3ad6029c7fcd778d00fbee02a1`, worker cache `omnevum-shell-864f5f5b6e7567d4`) was served at `http://127.0.0.1:4179/` with `npm run preview` and exercised from a fresh Chromium origin. The run completed capture, bounded URL Acquire, Track, finance, health, Compose list/table/chart, Relate, derived Search, AMOLED Dark, `JohnOS` in-app branding, French (Canada), reload persistence, and Vault import preview/confirmation. The confirmed local Vault merge reported `11` imported and `0` skipped. No canonical content or credential was sent to a remote service.

This strengthens the local built-artifact MVP evidence only. It remains one Chromium surface and one local static origin; it does not change the open GitHub Pages, browser-family, WCAG, native-quota, cross-origin, provider, dependency/SBOM, deployment, or human-acceptance rows.

## Recovery snapshot follow-up

The boot-recovery export now attempts the validated portable Vault first. If malformed canonical state makes that path fail closed, `CanonicalStore.exportRetainedState()` returns a read-only `OMNEVUM_RECOVERY_SNAPSHOT` containing raw retained records/history, bounded readable Artifact payloads, and valid/invalid counts; the failure shell labels the download as a snapshot and does not claim it is directly restorable. A fake-indexeddb regression injects one malformed record, verifies the normal Vault export fails without masking corruption, verifies the snapshot retains both raw records and the valid history count, and confirms the valid record remains readable. The current run passes `40` test files and `112` tests.

This is deterministic local recovery evidence only. It does not qualify real browser corruption, native quota exhaustion, interrupted canonical migration, cross-origin restore, repair tooling, or release readiness.

## Safe Presentation Mode follow-up

Presentation resolution now has an explicit contract: Safe Presentation Mode selects a known-good built-in profile, while malformed stored presentation remains untouched and is reported as a fallback outside safe mode. The regression stores an invalid profile beside a canonical record, resolves safe mode, and verifies both the original malformed setting and canonical record remain unchanged. This is deterministic storage/core evidence; browser interaction, visual recovery, assistive technology, and target-matrix qualification remain open.

## Stale-client storage follow-up

CanonicalStore now fences a live client when another client requests an IndexedDB version upgrade: the first connection closes on `versionchange`, clears its persistence state, and rejects later reads/writes until explicitly reopened. A fake-indexeddb regression upgrades a second connection to version `7` and verifies the stale client cannot continue reading. This is deterministic concurrency evidence; native multi-tab/browser behavior and repair/reopen UX remain open.

## Interrupted canonical migration follow-up

At source revision `9421223`, `src/core/storage.test.ts#preserves-canonical-data-when-an-IndexedDB-migration-transaction-is-interrupted` creates the current schema-6 store, writes a canonical record, closes the client, starts a version-7 upgrade, creates a migration marker, and aborts the upgrade transaction. A fresh `CanonicalStore` then reopens the database and reads the exact original record, proving that the interrupted upgrade does not silently reset retained canonical data and that ordinary reopen is a recovery path. This is deterministic fake-indexeddb evidence only; native browser quota/corruption behavior, repair of malformed canonical rows, cross-browser migration, and production deployment remain open.

## Optional OPFS fallback follow-up

The canonical owner remains IndexedDB even when optional persistence/large-file APIs are unavailable. `src/core/storage.test.ts#keeps-canonical-records-on-the-indexeddb-fallback-when-optional-persistence-apis-are-unavailable` injects an unavailable storage-estimate/persistence surface, writes a canonical record, confirms exact readback, and confirms health does not manufacture a persistence claim. The device capability contract separately reports OPFS as optional. This is deterministic fallback evidence; browser-row qualification and any future OPFS-dependent large-file feature remain open.

## GitHub Pages deployment path

The repository now contains `.github/workflows/pages.yml`, which uses the official GitHub Pages custom-workflow shape: locked install, full `npm run ci`, top-level `dist/` Pages artifact, protected `github-pages` environment, and `pages:write`/`id-token:write` deployment permissions. This proves the repository deployment path is executable in principle, not that a remote workflow ran. The live Pages URL, routing, clean-origin smoke, rollback, browser matrix, and release promotion remain unverified until the configured remote repository executes the workflow.

## Current built-artifact target follow-up

The artifact bound by `docs/control/release-evidence.json` (`sourceRevision: 4f0eed0`, digest `4c357ff2ed4efb6fc2602f7708652e548c89b0eac4f50fb9c1160e02f35c5515`, worker cache `omnevum-shell-979360cae1e7c0b4`) was served from `dist/` at `http://127.0.0.1:4201/` in the Codex In-app Browser Chromium surface. A fresh origin loaded the current shell, accepted a synthetic capture, switched the presentation theme, and retained the canonical record and presentation state after reload. This extends local current-artifact evidence only; it does not qualify GitHub Pages, Safari/WebKit, Firefox, assistive technology, native quota, or deployment rollback.

## Current built-artifact source-meaning follow-up

The exact `npm run ci` artifact at source revision `61f9b69` (artifact digest `cd25e878ff7f13d213741fe1857ba8e60fe40415e1c0950f372fde6db9fe63ce`, worker cache `omnevum-shell-e697b98dc82d8ec0`) was served on the clean local static origin `http://127.0.0.1:4202/` in the Codex In-app Browser Chromium surface. With synthetic data, the Source / meaning workbench:

- created two canonical source/subject notes;
- created an Evidence link through `platform.evidence` without copying either record;
- rejected an annotation whose quote was absent from the selected source, then created an active source-revision-bound annotation through `platform.annotate`;
- accepted a GeoJSON `Point`, validated WGS84 coordinates through `platform.place`, and stored one canonical place observation;
- reloaded the clean origin and retained five active records, one evidence link, one active annotation, and one place; the browser returned no warning/error console entries.

This is current local Chromium/static-preview evidence for the source-meaning slice only. It does not qualify heterogeneous provider import, GPX/timeline reuse, external Web-document preservation, spatial analysis, Safari/Firefox, assistive technology, GitHub Pages deployment, or release readiness.

## Current built-artifact sharing follow-up

The exact `npm run ci` artifact at source revision `6c872c8` (artifact digest `6dd97c1814a8e4b4c8e7c36043bb13c44a27a3c55bf2813195397c1c136eefc9`, worker cache `omnevum-shell-42a84fd68e3032e8`) was served on the clean local static origin `http://127.0.0.1:4207/` in the Codex In-app Browser Chromium surface. With synthetic records, the Share / disclose workbench:

- exported zero records when two private records were selected and the private-inclusion checkbox was off, reporting both omitted records;
- exported both selected records only after the explicit private-inclusion checkbox was enabled;
- created a purpose-bound `platform.share` grant for `person:reviewer` covering both selected records in its declared Personal Space;
- exported zero records until explicit private inclusion was enabled, then exported both records through the selected active grant;
- revoked the grant through the canonical command path, which disabled future export, then reloaded with the revoked grant and source records present; no browser warning/error console entries were returned.

This is current local Chromium/static-preview evidence for bounded sharing only. It does not qualify remote delivery/effects, provider ACLs, stale-share reconciliation, cross-target disclosure, GitHub Pages deployment, or release readiness.

## Current built-artifact multilingual follow-up

The exact same `npm run ci` artifact at source revision `6c872c8` (artifact digest `6dd97c1814a8e4b4c8e7c36043bb13c44a27a3c55bf2813195397c1c136eefc9`, worker cache `omnevum-shell-42a84fd68e3032e8`) was served on the clean local static origin `http://127.0.0.1:4208/` in the Codex In-app Browser Chromium surface. With synthetic records, the preview:

- retained one French-authored and one English-authored canonical record without translating source text;
- switched the presentation UI to `fr-CA`, searched the English token `Hello`, and returned one result with a healthy derived index;
- reloaded with the French UI and both original source texts present; no browser warning/error console entries were returned.

This is local Chromium evidence for the presentation/search slice only. It does not qualify mixed-language Vault import/summary, AI/tool language-neutral semantic IDs, other browser families, deployment, or release readiness.

## Current built-artifact sync follow-up

The exact `npm run ci` artifact at source revision `b1ffa19` (artifact digest `4dcdb2d8414248de3e128c2db29da3952633b18ab134c2644d01121016dc26a6`, worker cache `omnevum-shell-60930e9e8eb3697c`) was served from the built `dist/` files by a temporary single-origin static harness at `http://localhost:4213/` in the Codex In-app Browser Chromium surface. The same harness exposed `/replica` as a bounded local replica containing synthetic record `remote-sync-sentinel`.

- The Sync / Portability form accepted the owner-controlled `http://localhost:4213/replica` development endpoint and reported `Sync completed: 1 imported, 0 skipped, 0 conflict(s), 0 tombstone(s) preserved.`
- The imported `Remote sync sentinel` appeared in the canonical record list as a Personal Note owned by `core.remote`, revision 1; the local replica received the merged PUT payload (`461` bytes).
- Browser diagnostics returned no warning/error console entries.

This qualifies the provider-neutral pull/merge/push seam and its localhost development exception only. Production requires HTTPS; consumer-cloud/self-host provider qualification, authentication/key brokering, external security, offline interruption/rejoin behavior, browser-level tombstone reconciliation, and release readiness remain open. No canonical user data or credential was sent to a third party.

## Current built-artifact partial-sync failure follow-up

The current exact `npm run ci` artifact at source revision `aa5a8e4` (artifact digest `e7c96a631ead1cf288f1f22909eb27bac0520a4d7bccff06c2cda1ba4883f8a1`, worker cache `omnevum-shell-ef6a4afc50ad3df7`) was served from `dist/` at `http://localhost:4214/` in the Codex In-app Browser Chromium surface. A synthetic same-origin replica returned one `partial-sync-sentinel` record on pull and HTTP 503 on push. The Sync / Portability UI reported: `Local merge completed (1 imported, 0 skipped, 0 conflict(s), 0 tombstone(s) preserved), but remote push failed. Review local records before retrying. Remote sync push failed with HTTP 503`. The imported `Partial sync sentinel` remained visible, health reported `1 active, 0 archived, 0 revision snapshot(s), 0 artifact payload(s); search index healthy.`, and localhost app-origin diagnostics returned no warning/error entries.

The unit regression in `src/core/sync.test.ts` covers the same partial-merge contract. This proves truthful local state handling for a failed remote push only; it does not qualify durable Effect/Outbox retry, authentication, provider migration, offline rejoin, or external transport security.

## Current built-artifact release offline follow-up

The same current artifact at source revision `aa5a8e4` (digest `e7c96a631ead1cf288f1f22909eb27bac0520a4d7bccff06c2cda1ba4883f8a1`, worker cache `omnevum-shell-ef6a4afc50ad3df7`) was reloaded on `http://localhost:4214/` after the partial-sync receipt. The browser reported controller `http://localhost:4214/sw.js` in `activated` state; CDP network emulation was set offline, the shell reloaded, the imported `Partial sync sentinel` remained visible, and health reported `1 active, 0 archived, 0 revision snapshot(s), 0 artifact payload(s); search index healthy.` Network emulation was restored afterward and no localhost app-origin warning/error entries were returned.

This binds offline reload evidence to the current release artifact only. GitHub Pages, other browser families, assistive technology, native quota/corruption/migration interruption, and explicit degradation of network-dependent optional capabilities remain open.

## Current built-artifact offline follow-up

The same exact artifact at source revision `b1ffa19` (digest `4dcdb2d8414248de3e128c2db29da3952633b18ab134c2644d01121016dc26a6`, worker cache `omnevum-shell-60930e9e8eb3697c`) was exercised on the fresh `http://localhost:4213/` origin. After the shell loaded, CDP network emulation was set offline; the browser created `Offline receipt note`, reloaded, retained two active canonical records, and reported a healthy derived search index. Network emulation was then restored. The browser returned no warning/error console entries.

This strengthens local Chromium offline mutation/reload evidence only. GitHub Pages execution, other browser families, assistive technology, native quota/corruption/migration interruption, and explicit degradation of network-dependent optional capabilities remain open.

## Current built-artifact Edge follow-up

The same exact artifact at source revision `b1ffa19` (digest `4dcdb2d8414248de3e128c2db29da3952633b18ab134c2644d01121016dc26a6`, worker cache `omnevum-shell-60930e9e8eb3697c`) was served on `http://localhost:4213/` in Microsoft Edge `153.0.0.0` on the Windows target. A synthetic `Edge browser qualification sentinel` capture persisted across reload. The browser reported service-worker controller `http://localhost:4213/sw.js` in `activated` state; with CDP network emulation offline, the shell reloaded, retained the sentinel, reported `1 active, 0 archived, 1 revision snapshot(s), 0 artifact payload(s); search index healthy.`, and then recovered when network emulation was restored. No warning/error entries from the localhost app origin were returned.

This extends current-artifact Chromium-family local evidence to Edge desktop only. It does not qualify GitHub Pages, Safari/WebKit, Firefox, assistive technology, native quota/corruption/migration interruption, or release readiness; extension-origin diagnostics were excluded from the app-origin result.

## Current built-artifact recovery-repair follow-up

The current `npm run ci` build at source revision `4eb1436` has artifact digest `26010d2645ae2c9b0c7e774230d841bf6dece25898710858a0cba5d434babea7` and worker cache `omnevum-shell-1c98da786a5d0ffe`. The recovery surface now offers an explicit `Repair from retained snapshot` action. The repair regression injects a malformed canonical row, obtains the read-only recovery snapshot, rejects a snapshot containing no valid canonical record, accepts only valid records/history/artifact payloads, removes malformed canonical rows only through the explicit repair method, marks search derived state for rebuild, and confirms the valid record exports as a normal Vault afterward. This is code/test evidence; browser interaction, native corruption/quota behavior, and production deployment remain open.

## Isolated-origin Vault transfer follow-up

The portable baseline is exercised by `src/core/storage.test.ts#round-trips-a-portable-vault-while-preserving-identity-and-provenance`: separate source and destination `CanonicalStore` databases model isolated browser-private storage, and an integrity-protected `OMNEVUM_VAULT` transfer preserves the canonical ID and provenance without a backend. The current built-artifact MVP receipt also confirms Vault preview/confirmation through the UI. This establishes the core user-mediated transfer contract only; a real two-HTTPS-origin run, materially different browser-family restore, large-Vault limits, and production deployment remain open.
