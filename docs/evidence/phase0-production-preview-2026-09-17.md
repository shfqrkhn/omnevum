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

## Current built-artifact Edge recovery-fault follow-up

The current receipt-bound artifact at source revision `307470e` and digest `3c1f8257df41e5e5308920d7febb5684f5a50b0f1442cc687d8360a80e98f592` was served at `http://127.0.0.1:4229/` in Microsoft Edge `153.0.4234.32`. A bounded malformed row was injected into the local test origin's canonical IndexedDB records store. On reload, the app refused normal startup and visibly rendered `Local storage needs attention`, preserved the valid existing data path, and exposed `Retry`, `Export retained state`, and `Repair from retained snapshot`.

The visible `Export retained state` action completed and reported: `Read-only recovery snapshot exported; canonical state was not changed. Repair or restore it before resuming writes.` This qualifies the current-artifact Edge recovery-shell detection and read-only retained-state export interaction for a synthetic local fault. The repair button was not activated in this receipt because it removes the injected malformed local row after confirmation. Native quota exhaustion, real browser corruption, migration interruption through a shipped update, accessibility/target breadth, deployment, and release readiness remain open.

## Isolated-origin Vault transfer follow-up

The portable baseline is exercised by `src/core/storage.test.ts#round-trips-a-portable-vault-while-preserving-identity-and-provenance`: separate source and destination `CanonicalStore` databases model isolated browser-private storage, and an integrity-protected `OMNEVUM_VAULT` transfer preserves the canonical ID and provenance without a backend. The current built-artifact MVP receipt also confirms Vault preview/confirmation through the UI. This establishes the core user-mediated transfer contract only; a real two-HTTPS-origin run, materially different browser-family restore, large-Vault limits, and production deployment remain open.

## Current built-artifact triage follow-up

The current `npm run ci` build at source revision `cacd424` is bound in `docs/control/release-evidence.json` by artifact digest `a3cb895db36e42f68899549b1e16d8810d93e4d61940dfecd16133de90cbc07a`; its stamped service-worker cache is `omnevum-shell-586584f95a052ce1`. The daily MVP triage surface now presents localized Review, Defer, Clarify, Keep as reference, Archive, Link, and bounded Note/Task Route actions. Review/defer/clarify/reference/link/route updates carry the record's expected revision through the canonical CommandBus path; link creates one idempotent `platform.relate` reference and closes the source as `LINKED`, route creates one explicit canonical Note or Task with source linkage and archives the staging source, archive uses the canonical archive command, stale reference disposition is cleared by later triage changes, and failures report that no state change was confirmed. Domain and CommandBus tests cover explicit triage states, reference disposition, malformed-state defaulting, idempotent link closure, and source-preserving route closure.

On the same artifact at `http://127.0.0.1:4220/` in the Codex In-app Browser Chromium surface, a fresh capture entered the inbox; the new `Keep as reference` action cleared the inbox, advanced the record to revision 2 while keeping it active, and retained a search-healthy health line. A second fresh capture exposed the target selector and `Create link` action; activating it created one visible `platform.relate` record, advanced the source to revision 2, raised the relationship count to 1, cleared the inbox, and kept search healthy. A third fresh capture exposed the Route selector; choosing Task created one active canonical Task with source-linked text, raised the open-task signal, archived the staging Note, cleared the inbox, and kept search healthy. The parent artifact receipt separately observed Defer, Clarify, Review, and Archive; these current-artifact runs bind the reference, link, and route paths to the current digest.

This is bounded source/unit and local Chromium interaction evidence only. Split breadth, defer scheduling semantics, broader accessibility/target qualification, and complete triage acceptance remain open.

## Current built-artifact triage split follow-up

The current `npm run build` artifact at source revision `29e6e33` is bound in `docs/control/release-evidence.json` by artifact digest `57b0b44ec72352884255ded9b23f44550199a0576feeba584cca7fcf74919d72`; its stamped service-worker cache is `omnevum-shell-ffcc7735ee394400`. The triage command owner now admits a bounded split of two to four non-empty parts. Each part is explicitly selected as a canonical Note or Task, retains the source truth class, sensitivity, subject, Space data, and `provenance.sourceId`, records `triageDisposition: SPLIT` and its source/index/count, and closes the original staging record by archiving it. Repeated completion after the source is closed returns the existing matching children rather than creating duplicate writable copies; mismatched retry parts are rejected.

On a fresh origin at `http://127.0.0.1:4221/` in the Codex In-app Browser Chromium surface, a synthetic ambiguous Note was captured, the new Split control accepted two lines, and the UI reported `Split into 2 canonical record(s); the staging source was archived.` The inbox count changed to zero; health reported `2 active, 1 archived, 5 revision snapshot(s), 0 artifact payload(s); search index healthy.` A second synthetic Task source was split through the same UI with Task selected, producing two active Task records; health reported `4 active, 2 archived, 10 revision snapshot(s), 0 artifact payload(s); search index healthy.` The command regression independently verifies mixed Note/Task parts, source linkage, archived staging state, and idempotent retry.

This is bounded source/unit and fresh-origin local Chromium interaction evidence only. It does not qualify split atomicity across storage failures, proposed-action breadth, defer scheduling semantics, broader accessibility/target coverage, or complete triage acceptance.

## Current built-artifact triage defer follow-up

The current `npm run ci` build at source revision `59e2775` is bound in `docs/control/release-evidence.json` by artifact digest `253c250a47c2607b00595e981517c8c9fecaab2a1028b26ab92a1f72a259b03b`; its stamped service-worker cache is `omnevum-shell-9f13c5fed2195d3f`. The triage owner now admits an explicit ISO due time through `deferTriage`, clears any stale disposition, and stores `triageStatus: DEFERRED` plus `triageDeferredUntil`. The review projection excludes valid future-deferred records and includes malformed or due records; this is in-app scheduling state only and does not claim closed-app notification.

On a fresh origin at `http://127.0.0.1:4222/` in the Codex In-app Browser Chromium surface, `Defer this mixed item until later` was captured and deferred using the visible `Defer until` control. The item left the inbox while health reported `1 active, 0 archived, 2 revision snapshot(s), 0 artifact payload(s); search index healthy.` A second item was deferred to a past local time; the review surface immediately re-presented it as `Due now triage item (deferred)`, while the future item remained hidden. The command regression verifies explicit due-time storage, stale-disposition clearing, and invalid-time rejection.

This is bounded source/unit and fresh-origin local Chromium interaction evidence only. It does not qualify closed-app/background delivery, external reminder companions, broader accessibility/target coverage, or complete triage acceptance.

## Current built-artifact safe direct-capture follow-up

The current `npm run build` artifact at source revision `183a9b8` is bound in `docs/control/release-evidence.json` by artifact digest `0c1ad17ce5a26c5058a33b49950bf6fe4bbe982694afc0eed61056b1098cbcf2`; its stamped service-worker cache is `omnevum-shell-4e5c8343e378f13d`. The Capture form now defaults to `triageStatus: INBOX` and exposes a visible, unchecked `Safe direct route (explicit)` control. Only checking that control assigns `REVIEWED`; the choice is reset after capture and does not alter canonical ownership or provenance.

On a fresh origin at `http://127.0.0.1:4223/` in the Codex In-app Browser Chromium surface, an unchecked `Default inbox sentinel` capture produced one visible inbox item. A second `Unambiguous direct sentinel` capture with the checkbox selected produced two active Notes while the review count remained one and the default item stayed in the inbox. Health reported `2 active, 0 archived, 2 revision snapshot(s), 0 artifact payload(s); search index healthy.`

This is bounded source/unit and fresh-origin local Chromium interaction evidence only. It does not qualify an automated ambiguity classifier, richer proposal UI, broader accessibility/target coverage, or complete triage acceptance.

## Triage delete/discard command follow-up

The current `npm run build` artifact at source revision `29361b7` is bound in `docs/control/release-evidence.json` by artifact digest `7914b0ca96f75521c4130bdce61dcf7ba0546180ce3a1c8fd260f89cfe99db37`; its stamped service-worker cache is `omnevum-shell-5c7a66cf10834034`. Triage now admits `deleteTriage`: it checks the active source revision, records `triageDisposition: DELETED` and `triageStatus: REVIEWED`, then archives the source through the existing reversible canonical archive path. The Recovery/Archived Records surface therefore retains the source for explicit restore instead of silently erasing history. The UI exposes Delete separately from Archive, and the CommandBus regression verifies provenance-preserving disposition, archived state, and no active writable copy.

This increment is source/unit and built-control evidence. A fresh-origin browser exposed the separate Delete action, but activation was not included in this receipt because graphical local deletion requires an action-time confirmation; no synthetic browser data was deleted.

## Current built-artifact reminder resume follow-up

The current `npm run build` artifact at source revision `29361b7` is bound in `docs/control/release-evidence.json` by artifact digest `7914b0ca96f75521c4130bdce61dcf7ba0546180ce3a1c8fd260f89cfe99db37`; its stamped service-worker cache is `omnevum-shell-5c7a66cf10834034`. The reminder surface stores the due state as canonical data and explicitly avoids claiming exact closed-app delivery.

On a fresh origin at `http://127.0.0.1:4225/` in the Codex In-app Browser Chromium surface, a synthetic `Resume reminder sentinel` was saved with a due date/time, the tab was closed, and a new tab reopened on the same origin. The reopened UI retained the canonical record and health reported `1 active, 0 archived, 1 revision snapshot(s), 0 artifact payload(s); search index healthy.` The Attention / Reminders projection visibly showed `Due on resume` and `record_<id> - Due on resume. Delivery is opportunistic; the reminder remains canonical.`

This is bounded local Chromium resume evidence for truthful missed-reminder surfacing and canonical persistence. It does not qualify exact background scheduling, a native app process close, external-calendar/ntfy/Gotify delivery, broader accessibility/target coverage, or release readiness.

## Current built-artifact atomic triage transition follow-up

The current `npm run ci` artifact at source revision `310d278` is bound in `docs/control/release-evidence.json` by artifact digest `5d7603fffe7b4f70efd04134c1dd242a20e7bf1d50e43fe7f7a75c39de6fe86a`; its stamped service-worker cache is `omnevum-shell-4a6680c6fbad4823`. `CanonicalStore.putMany` validates every record and expected revision before one IndexedDB transaction writes canonical rows, revision history, search invalidation, and artifact payloads. The triage link, route, split, and delete commands now use that owner path, so a stale source revision aborts the whole compound transition instead of leaving a child/reference or intermediate source mutation behind.

The regression `src/core/storage.test.ts#commits-a-canonical-write-batch-atomically-when-a-later-revision-check-fails` proves a candidate record and stale source update leave neither new canonical data nor history after the batch aborts. The existing triage command regressions continue to prove idempotent link/split behavior, source provenance, archived staging state, and explicit delete disposition; the full CI gate passed with `41` test files and `130` tests.

This establishes the bounded local IndexedDB atomicity and revision-fencing contract. It does not qualify native storage-engine fault injection, quota/corruption interruption during a compound transaction, cross-tab concurrency beyond the revision fence, deployment, broader target qualification, or release readiness.

## Current built-artifact proposal-only triage follow-up

The current `npm run ci` artifact at source revision `0aaa935` is bound in `docs/control/release-evidence.json` by artifact digest `97c65727fe2863352de6409771626e6c82d66a75a147844ae96286b9f21109bd`; its stamped service-worker cache is `omnevum-shell-bad679538cfe033d`. The universal inbox now renders a deterministic proposal projection from the raw canonical source: possible owner(s), possible type(s), and admitted action(s). The projection is explicitly non-committing and is not an AI or canonical-write path.

On a fresh origin at `http://127.0.0.1:4226/` in the Codex In-app Browser Chromium surface, an `Ambiguous proposal sentinel: note this and follow up` capture remained a single active revision-1 inbox record. The review surface visibly reported: `Proposal only - possible owner(s): core.capture; type(s): Note, Task; action(s): Mark reviewed, Clarify, Defer, Keep as reference, Create link, Route, Split, Delete. No canonical state changed.` Health reported `1 active, 0 archived, 1 revision snapshot(s), 0 artifact payload(s); search index healthy.`

This binds the proposal-only guidance and no-silent-commit boundary to the current built artifact. It does not qualify AI classification, richer owner/domain inference, batch triage, broader accessibility/target coverage, or release readiness.

## Current automation proposal boundary follow-up

The current source revision `bbc902d` is covered by the exact built artifact already bound in `docs/control/release-evidence.json` (artifact digest `97c65727fe2863352de6409771626e6c82d66a75a147844ae96286b9f21109bd`; worker cache `omnevum-shell-bad679538cfe033d`). The bounded declarative automation evaluator remains data-only, depth/node/action/argument limited, prototype-path rejecting, and proposal-only. Its action schema now admits only the explicit semantic-command IDs `record.create`, `record.update`, `triage.defer`, `triage.link`, `triage.route`, `triage.split`, and `triage.delete`; unknown commands such as `network.fetch` are rejected before proposal emission.

`src/core/automation.test.ts` proves a true rule emits `requiresNormalCommandPath: true`, a malformed/prototype rule is rejected or budget-limited, and an unadmitted network command is rejected. This is source/unit security evidence; a package-facing rule editor, execution adapter, permission/confirmation integration, and broader package/agent qualification remain open.

## Current built-artifact source-annotation follow-up

The current source revision `bbc902d` is covered by the exact built artifact already bound in `docs/control/release-evidence.json` (artifact digest `97c65727fe2863352de6409771626e6c82d66a75a147844ae96286b9f21109bd`; worker cache `omnevum-shell-bad679538cfe033d`).

On a fresh origin at `http://127.0.0.1:4227/` in the Codex In-app Browser Chromium surface, two canonical Note records were captured: `Annotation source sentinel text` and `Annotation subject sentinel`. The Source/Meaning workbench selected the source record, accepted the exact quoted source text, and saved `Source text confirms the annotation relationship.` The UI visibly reported `Annotation saved.` and `0 evidence link(s), 1 annotation(s), 0 place(s); anchors: 1 active, 0 stale, 0 orphaned.` The canonical records list showed the separate annotation record with `platform.annotate` provenance while the source and subject records remained active; health reported `3 active, 0 archived, 3 revision snapshot(s), 0 artifact payload(s); search index healthy.`

This is current built-artifact and source/unit evidence for quote-validated text annotation, separate canonical meaning, source identity, and an active anchor. Image/PDF-region markup, portable annotation export mapping, source-change invalidation into stale/orphan/ambiguous states, broader accessibility/target qualification, and release readiness remain open.

## Current automated FOSS compliance pipeline follow-up

The clean CI path now regenerates `docs/control/dependency-sbom.json` and `docs/control/foss-compliance.json` from the exact `package-lock.json` identity. The current receipt covers `87` locked packages, emits one attribution entry per package, records `0` policy-critical metadata findings, and identifies `12` MPL-2.0 source-obligation reviews; its status is `PASS_WITH_REVIEW_LIMITATIONS` and its lockfile SHA-256 is `2209213b8c2ac98ae99979dfdd4fc1837124b88543fcac2dfc8f3dcde81212af`.

`scripts/license-audit.mjs` cross-checks the receipt against the lockfile and fails the gate if the receipt is stale, attribution coverage is incomplete, package metadata is missing, or policy-critical findings remain. `npm run ci` passed after this increment with `LICENSE_AUDIT_PASS`, `FOSS_COMPLIANCE_PASS`, `0` npm high-severity vulnerabilities, `41` test files, and `132` tests.

This proves the automated inventory/attribution/SBOM/source-obligation control path and fail-closed metadata behavior. Exact copyright notices, corresponding-source fulfillment, legal rights review, and distribution-profile approval remain release-visible limitations.

## Current Effect/Outbox and credential-boundary follow-up

The platform-owned Effect/Outbox contract is covered by the current source test suite. `src/core/effect-runner.test.ts` proves an interrupted `IN_FLIGHT` operation is promoted through `OUTCOME_UNKNOWN` and `RECONCILE` without blind replay, completes only through the reconciliation adapter, persists retryable failure without duplicating the operation, keeps an operation visibly in `RECONCILE` when no adapter exists, and refuses expired or revoked operations. `src/core/effect.test.ts`, `src/core/storage.test.ts`, and `src/core/security-contracts.test.ts` cover bounded typed persistence, idempotency identity, state transitions, and secret-shaped payload rejection.

The current credential/key boundary is covered by `src/core/credential.test.ts` and `src/core/sync-routes.test.ts`: metadata never exposes the raw secret, use requires a bounded purpose callback, revocation/clear removes session material, and sync route configuration rejects a client-secret field while keeping provider secrets behind the broker. This is source/unit contract evidence only; browser/process restart, a real offline connector, ambiguous remote responses against an external system, current authority/Space revalidation through a shipped UI, pending-effect invalidation after credential revocation, and target qualification remain open.

## Current Artifact multi-reference follow-up

The current `src/core/artifact.test.ts#keeps-one-artifact-payload-shared-by-multiple-references-while-rebuilding-derived-search` regression creates one canonical `platform.artifact` payload, references that same Artifact from two separate `platform.relate` records, invalidates and rebuilds the derived search index, and verifies the exact payload remains readable without a duplicate Artifact record. `npm run ci` passed with `41` test files and `132` tests.

This proves the bounded canonical Artifact/reference and derived-index-rebuild invariant at source/unit level. Browser attachment/relationship evidence, preview/OCR adapters, large-file cancellation/resource bounds, hostile-rendering qualification, and cross-target release evidence remain open.

## Current package, game, device, and extension contract follow-up

The current source contracts cover four bounded seams: `src/core/package-contract.test.ts` proves declarative package admission, generated baseline form/list views, canonical-type collision prevention, disablement, and retirement; `src/core/game.test.ts` proves declared-action admission, deterministic input, pause/resume, save/load, and incompatible-save rejection; `src/core/device.test.ts` proves capability detection, explicit file/clipboard/share/location access, manual fallback, media-boundary shape, and 5 MiB input limits; `src/core/extension-policy.test.ts` proves declarative admission and explicit `DISABLED_UNQUALIFIED` status for executable third-party extensions.

These are source/unit contract increments only. A nontrivial browser game/package generated UI, fresh-agent creation/resume, real device permission-denial/cancellation flows, barcode/QR routing, isolated candidate upgrade, and target qualification remain open.

## Current scoped-search boundary follow-up

The current source revision `db7f8f6` is bound in `docs/control/release-evidence.json` to artifact digest `4132515cda2b1b26dc14f0a4b2ff27ea4193c35d87d1db0bdf9a5f505b155823`; its worker cache is `omnevum-shell-7777771bf1a2256f`. `CanonicalStore.search(query, allowedIds)` now filters derived search documents before MiniSearch tokenization and ranking. The UI computes the active Space projection first, passes its canonical IDs into the search owner, and uses the same bounded result count for the visible status. `src/core/storage.test.ts#applies-an-allowed-id-scope-before-derived-search-tokenization` proves an allowed record is returned while an out-of-scope record with the same token is never included; an empty allowed set returns no result.

On a fresh built-artifact origin at `http://127.0.0.1:4228/` in the Codex In-app Browser Chromium surface, two same-term records were captured: `Scoped search sentinel allowed` in Personal and `Scoped search sentinel denied` in Work. With View Space set to Personal, searching `Scoped search sentinel` visibly reported `1 result(s); derived index healthy.` and rendered only the Personal record; the Work record was absent from the result list. Health simultaneously reported `2 active, 0 archived, 2 revision snapshot(s), 0 artifact payload(s); search index healthy.`

This closes the current text-search projection boundary at source/unit, UI-owner, and built-preview evidence levels. Vector/analytical caches, cross-tab permission invalidation, external share/search routes, target accessibility, and full release qualification remain open.

## Current shared AI broker boundary follow-up

The current source revision `db7f8f6` is bound in `docs/control/release-evidence.json` to artifact digest `4132515cda2b1b26dc14f0a4b2ff27ea4193c35d87d1db0bdf9a5f505b155823`; its worker cache is `omnevum-shell-7777771bf1a2256f`. The shared `AiRouteRegistry`, `ContextBroker`, and `AiBroker` serve multiple domain workflows without domain-owned provider credentials. `src/core/ai.test.ts#shares-one-credential-free-broker-across-distinct-domain-owners` exercises the same broker/route across `core.capture` and `core.track` with bounded source IDs and DERIVED provenance.

`AiBroker.proposal` now admits only the centralized semantic-command set, rejects authority-shaped controls such as provider, disclosure, permission, credential, network, and scope fields, rejects record/source/target IDs outside the projected context, and always returns a proposal requiring the normal command path. `src/core/ai.test.ts#rejects-malicious-proposal-commands-and-authority-context-widening` proves unadmitted mutation, disclosure widening, and out-of-scope IDs are rejected while an in-scope proposal remains non-committing.

This is source/unit security evidence for the shared broker and proposal boundary. Provider adapters, process/browser isolation, real AI workflow UI, external route currentness/terms, command-path execution integration, and target/release qualification remain open.

## Current optional tool-broker boundary follow-up

The current source revision `db7f8f6` and artifact digest `4132515cda2b1b26dc14f0a4b2ff27ea4193c35d87d1db0bdf9a5f505b155823` define the optional tool seam. `src/core/tool-broker.ts` admits only enabled descriptors whose declared commands are in the shared semantic-command set, projects the caller's explicit record IDs through `ContextBroker`, and validates endpoint output through `validateAiProposal`; it has no canonical-store or credential authority. `src/core/tool-broker.test.ts` proves an admitted proposal carries only scrubbed selected context and `requiresNormalCommandPath`, a changed schema declaring `network.fetch` is rejected, malicious output attempting disclosure/context widening is rejected, and endpoint loss returns `UNAVAILABLE` without touching core state.

This is source/unit evidence for the optional browser-tool integration boundary. A real MCP/standard browser endpoint, permission/confirmation UI, process/browser isolation, external currentness/terms review, and target/release qualification remain open.

## Current heterogeneous Acquire mapping follow-up

The current `npm run ci` artifact at source revision `db7f8f6` is bound by `docs/control/release-evidence.json` to artifact digest `4132515cda2b1b26dc14f0a4b2ff27ea4193c35d87d1db0bdf9a5f505b155823` and worker cache `omnevum-shell-7777771bf1a2256f`. `stageText` now retains one source digest and ordered source sequence for a heterogeneous JSON export, recognizes event/artifact/location-shaped rows, and routes those candidates to the existing `platform.time`, `platform.artifact`, and `platform.place` owners; person-shaped input remains a reviewable `core.acquire` candidate rather than silently inventing a new owner. `src/core/acquire.test.ts#routes-heterogeneous-event-artifact-and-location-candidates-to-existing-owners` proves the mapping and shared source identity.

On a fresh built-artifact origin at `http://127.0.0.1:4229/` in the Codex In-app Browser Chromium surface, the Acquire form staged a four-row synthetic JSON fixture and visibly listed `observation - Preview event`, `file - preview.pdf`, `observation - Preview place`, and `note - Preview person`. Accepting the staged candidates reported `Imported 4 record(s); skipped 0.` The canonical list then showed `Observation Preview place platform.place`, `Observation Preview event platform.time`, `Attach artifact preview.pdf platform.artifact`, and `Note Preview person core.acquire`; health reported `4 active, 0 archived, 4 revision snapshot(s), 0 artifact payload(s); search index healthy.`

This is source/unit mapping evidence only. Real provider exports, entity resolution, accepted UI review, artifact payload retention, timeline/Place semantic promotion, and target/release qualification remain open.

## Current built-artifact presentation personalization follow-up

The current `npm run ci` build at source revision `307470e` is bound to artifact digest `3c1f8257df41e5e5308920d7febb5684f5a50b0f1442cc687d8360a80e98f592`; its stamped service-worker cache is `omnevum-shell-0b6250547b9cf87e`. On a fresh built-artifact origin at `http://127.0.0.1:4229/` in the Codex In-app Browser Chromium surface, the presentation form accepted and applied a bounded custom profile: product name `JohnOS`, tagline `A private cockpit`, compact density, Serif typeface, symbol icon treatment, and Home/Capture/Records labels `Today`/`Inbox`/`Journal`. Navigation visibility was customized to hide Track and Domains while keeping Recovery and Personalization reachable; Home composition hid Shared signals and retained the summary and due-on-resume surfaces.

The rendered navigation showed the custom labels and symbols, the hidden sections were absent from the visible page, and the Home surface changed immediately. After reload, the custom profile remained applied; the visible navigation, hidden sections, hidden Home surface, tagline, and presentation controls all retained their values. Canonical health remained `4 active, 0 archived, 4 revision snapshot(s), 0 artifact payload(s); search index healthy.` and the active record count and Home total both remained `4`.

`src/core/presentation.test.ts` covers bounded profile parsing, required Recovery/Personalization reachability, reversible safe defaults, and preservation of malformed settings/canonical data. The full CI gate passed with `42` test files and `140` tests. This proves the declarative personalization path and local Chromium persistence for the exercised profile; WCAG/assistive-technology and browser-target breadth, icon/logo assets, installed-host metadata behavior, import/export profile compatibility, and release qualification remain open.

## Current built-artifact Edge desktop follow-up

The exact artifact at source revision `307470e` and digest `3c1f8257df41e5e5308920d7febb5684f5a50b0f1442cc687d8360a80e98f592` was served from `dist/` at `http://127.0.0.1:4229/` in Microsoft Edge `153.0.4234.32` on the Windows desktop target. A synthetic `Current Edge presentation qualification sentinel` capture was accepted through the normal Capture form; the UI reported `1 active, 0 archived, 1 revision snapshot(s), 0 artifact payload(s); search index healthy.` The canonical list showed the Note owned by `core.capture`, revision 1, and the Review surface retained the expected inbox item.

After reload on the same origin, the sentinel remained present, the record count remained `1`, and the same healthy-index line was visible. This qualifies current-artifact Edge desktop capture/reload persistence only. It does not qualify Edge offline behavior, mobile/responsive/accessibility conformance, Safari/WebKit or Firefox, native fault injection, deployment, or release readiness.

## Historical built-artifact Edge offline follow-up

The exact artifact at source revision `307470e`, digest `3c1f8257df41e5e5308920d7febb5684f5a50b0f1442cc687d8360a80e98f592`, and worker cache `omnevum-shell-0b6250547b9cf87e` was exercised at `http://127.0.0.1:4229/` in Microsoft Edge `153.0.4234.32`. CDP network emulation was set offline after the shell was loaded. Through the normal Capture form, a synthetic `Current Edge offline qualification sentinel` was written locally; the UI reported `3 active, 0 archived, 3 revision snapshot(s), 0 artifact payload(s); search index healthy.` The shell was then reloaded while offline and retained the sentinel and the healthy derived index. Network emulation was restored afterward, and Edge app-origin warning/error logs were empty.

This strengthens current-artifact Edge desktop offline reload/mutation evidence only. The duplicate sentinel rows were an interaction-timing artifact in this synthetic fixture and do not change the qualification. GitHub Pages, Safari/WebKit, Firefox, assistive technology, native quota/corruption/migration interruption, explicit degradation of network-dependent capabilities, and release readiness remain open.

## Current built-artifact presentation metadata follow-up

The current `npm run ci` artifact is bound in `docs/control/release-evidence.json` to source revision `bd9e242`, artifact digest `21573b205032581c9efa72bb6a70fdfc693c9785204774216808e1541d676e3c`, and service-worker cache `omnevum-shell-bb5235f9801ca7f8`. On `http://127.0.0.1:4229/` in Microsoft Edge `153.0.4234.32`, the presentation form accepted the synthetic product name `Edge Metadata Sentinel`. Read-only DOM inspection then recorded `document.title = Edge Metadata Sentinel - Life, in context.` and `meta[name="theme-color"] = #f7f8fa`. After AMOLED Dark was selected, the title remained personalized and the theme-color became `#000000`; reload retained the personalized title, product setting, dark theme, and theme-color.

The synthetic profile was reset afterward; the origin returned to the default `Omnevum - Life, in context.` title, light theme, `#f7f8fa` theme-color, and zero active records. This is current local Edge evidence for presentation-to-document metadata binding and reload persistence only. It does not qualify installed-host metadata, manifest/icon/logo assets, assistive technology, other browser targets, production hosting, or release readiness.

## Current built-artifact Edge responsive and keyboard follow-up

The same current artifact (`bd9e242`, digest `21573b205032581c9efa72bb6a70fdfc693c9785204774216808e1541d676e3c`, service-worker cache `omnevum-shell-bb5235f9801ca7f8`) was exercised at `http://127.0.0.1:4229/` in Microsoft Edge `153.0.4234.32`. With the viewport emulated at `390x844`, the app reported `innerWidth=390`, `innerHeight=844`, `bodyClientWidth=390`, `bodyScrollWidth=390`, and `85` visible labelled controls. Eight sequential Tab presses reached visible controls in order from the AMOLED theme button through Home, Capture, Acquire, Track / Observe, Domains, Search / Explore, and Space. The Edge warning/error console remained empty.

The temporary viewport override was cleared and the origin reloaded to the default light presentation with zero active records. This is current local Edge evidence for one compact responsive/keyboard path only; it does not establish WCAG conformance, assistive-technology acceptance, touch ergonomics, other browsers, or production-host qualification.

## Current built-artifact Edge current-artifact capture follow-up

The same current artifact (`bd9e242`, digest `21573b205032581c9efa72bb6a70fdfc693c9785204774216808e1541d676e3c`, service-worker cache `omnevum-shell-bb5235f9801ca7f8`) was served at `http://127.0.0.1:4229/` in Microsoft Edge `153.0.4234.32`. The normal Capture form accepted `Current artifact Edge capture sentinel`; the UI reported `1 active, 0 archived, 1 revision snapshot(s), 0 artifact payload(s); search index healthy.` After reload, the sentinel remained visible, the active and record counts remained `1`, and the same healthy-index state remained visible. The synthetic IndexedDB database was then deleted through the scoped browser test origin and a reload verified zero active/record counts and no sentinel residue.

This qualifies current-artifact Edge desktop capture/reload persistence and test-origin cleanup only. It does not qualify production deployment, other browsers, assistive technology, native quota/corruption/migration behavior, or release readiness.

## Current built-artifact Edge offline receipt refresh

The current artifact (`bd9e242`, digest `21573b205032581c9efa72bb6a70fdfc693c9785204774216808e1541d676e3c`, service-worker cache `omnevum-shell-bb5235f9801ca7f8`) was exercised at `http://127.0.0.1:4229/` in Microsoft Edge `153.0.4234.32`. CDP network emulation was set offline after the shell loaded. The normal Capture form wrote `Current artifact Edge offline sentinel` locally; the UI reported `1 active, 0 archived, 1 revision snapshot(s), 0 artifact payload(s); search index healthy.` Reload while offline retained the sentinel and the healthy index. Network emulation was restored, application-origin warning/error diagnostics remained empty, and the synthetic IndexedDB origin was deleted and reloaded to zero records.

This qualifies current-artifact Edge offline mutation/reload persistence only. It does not qualify production static hosting, Safari/WebKit, Firefox, assistive technology, native quota/corruption/migration, or explicit degradation of network-dependent capabilities.

## Current built-artifact Edge recovery-repair completion follow-up

The current artifact (`bd9e242`, digest `21573b205032581c9efa72bb6a70fdfc693c9785204774216808e1541d676e3c`, service-worker cache `omnevum-shell-bb5235f9801ca7f8`) was exercised at `http://127.0.0.1:4229/` in Microsoft Edge `153.0.4234.32`. A valid `Current artifact recovery valid sentinel` Note was captured first. A malformed canonical IndexedDB row was then injected into the scoped test origin. Reload entered the visible Recovery shell with `Local storage needs attention` and exposed `Repair from retained snapshot`.

The confirmation was accepted. The UI reported `Recovery repair retained 1 record(s), removed 1 malformed record(s), and retained 1 history entry. Reload to resume normal operation.` After reload, the app returned to `Local foundation ready`; health reported `1 active, 0 archived, 1 revision snapshot(s), 0 artifact payload(s); search index healthy.` A direct read of the scoped records store found exactly the valid sentinel and no malformed row. The synthetic IndexedDB origin was then deleted and reopened; the clean state verified `0` records with no sentinel residue.

This qualifies current-artifact Edge recovery-shell detection, explicit repair confirmation, valid-record retention, malformed-row removal, derived-index recovery, and scoped-origin cleanup. Native quota/corruption, an interrupted shipped migration, assistive technology, other browser families, production deployment, and release readiness remain open.

## Current built-artifact Chromium capture receipt refresh

The current artifact (`bd9e242`, digest `21573b205032581c9efa72bb6a70fdfc693c9785204774216808e1541d676e3c`, service-worker cache `omnevum-shell-bb5235f9801ca7f8`) was served at `http://127.0.0.1:4229/` in the Codex In-app Browser Chromium surface. The normal Capture form accepted `Current artifact Chromium capture sentinel`; the UI reported `1 active, 0 archived, 1 revision snapshot(s), 0 artifact payload(s); search index healthy.` After reload, the sentinel remained and the same healthy-index state remained visible. App-origin warning/error diagnostics were empty. The synthetic IndexedDB origin was deleted and reopened; the clean state verified `0` active records with no sentinel residue.

This refreshes current-artifact Chromium desktop capture/reload persistence and scoped-origin cleanup. It does not qualify a production host, mobile hardware, Safari/WebKit, Firefox, assistive technology, native quota/corruption/migration, or release readiness.

## Historical built-artifact presentation profile portability follow-up

The superseded artifact (`c548ccf`, digest `73aed9623d0b98d40cce3a18f27a68707a830ecb4a032dd8c19621696792b44d`, service-worker cache `omnevum-shell-d2369d0930fda918`) was served at `http://localhost:4230/` in the Codex In-app Browser Chromium surface. The visible Personalization controls exported a versioned `OMNEVUM_PRESENTATION_PROFILE` document and reported `Exported presentation profile.` A bounded JSON fixture was imported through the visible `Import profile` control; the UI reported `Imported presentation profile; canonical data was not changed.`, immediately applied `Portable Profile Sentinel`, dark theme, compact density, monospace typeface, glyphs, custom labels, and retained zero canonical records.

After reload, the personalized product name/tagline and presentation choices remained applied; the document title was `Portable Profile Sentinel - Life, in context.` and the theme control exposed `Light theme` as the dark-mode action. Health remained `0 active, 0 archived, 0 revision snapshot(s), 0 artifact payload(s); search index healthy.`, app-origin warning/error diagnostics were empty, and Reset presentation restored the default title/profile. The synthetic fixture and origin state were not retained.

This qualifies bounded standalone presentation-profile export/import validation, application, reload persistence, reversibility, and canonical-data isolation on the current Chromium artifact. Native file-system UX, profile migration across future schema versions, Safari/WebKit, Firefox, assistive technology, production hosting, and release readiness remain open.

## Historical built-artifact Chromium Safe Presentation recovery follow-up

The same superseded artifact (`c548ccf`, digest `73aed9623d0b98d40cce3a18f27a68707a830ecb4a032dd8c19621696792b44d`, service-worker cache `omnevum-shell-d2369d0930fda918`) was exercised at `http://localhost:4230/` in the Codex In-app Browser Chromium surface. A valid `Current artifact Safe Presentation recovery sentinel` Note was captured first. A malformed stored presentation setting (`schemaVersion=99`, product name `Broken Profile Sentinel`, theme `neon`, locale `xx`) was then injected into the scoped IndexedDB settings store.

After reload, the app retained the canonical record, displayed the malformed product name with a `Safe presentation fallback is active` status, and exposed `Use Safe Presentation Mode`. Activating it reloaded the built-in Omnevum profile, exposed `Exit Safe Presentation Mode`, and reported `Safe mode uses a known-good built-in presentation for this session and preserves the stored profile.` Health remained `1 active, 0 archived, 1 revision snapshot(s), 0 artifact payload(s); search index healthy.` A direct scoped read confirmed the malformed setting remained unchanged and exactly one canonical record remained. The synthetic origin was then deleted and reopened cleanly.

This qualifies browser Safe Presentation recovery, explicit session fallback, malformed-profile preservation, canonical-data preservation, and exit-path visibility on the current Chromium artifact. Native/browser-family breadth, assistive technology, production hosting, and release readiness remain open.

## Historical built-artifact Chromium offline network-capability follow-up

The same superseded artifact (`c548ccf`, digest `73aed9623d0b98d40cce3a18f27a68707a830ecb4a032dd8c19621696792b44d`, service-worker cache `omnevum-shell-d2369d0930fda918`) was exercised at `http://localhost:4230/` in the Codex In-app Browser Chromium surface. A `Current artifact offline sync capability sentinel` Note was captured locally. CDP network emulation was then set offline after the shell loaded; the bounded sync form was given `https://sync.invalid/replica` and `Sync now` completed with the visible status `Failed to fetch`. The local sentinel remained present and health remained `1 active, 0 archived, 1 revision snapshot(s), 0 artifact payload(s); search index healthy.`

Network emulation was restored, the synthetic IndexedDB origin was deleted and reopened, and the clean state verified `0 active, 0 archived, 0 revision snapshot(s), 0 artifact payload(s); search index healthy.` This qualifies explicit degradation/reporting for a network-dependent sync capability while local capture remains usable; it does not qualify remote provider authentication, consumer-cloud delivery, offline rejoin/reconciliation, other targets, or release readiness.

## Historical built-artifact Chromium Artifact attachment follow-up

The superseded artifact (`c548ccf`, digest `73aed9623d0b98d40cce3a18f27a68707a830ecb4a032dd8c19621696792b44d`, service-worker cache `omnevum-shell-d2369d0930fda918`) was served at `http://localhost:4230/` in the Codex In-app Browser Chromium surface. A temporary 46-byte fixture was supplied through the visible `Attach artifact` file chooser. The UI reported `Attached artifact-fixture.txt (46 bytes).`; the canonical list showed one `Personal - Attach artifact` record with `platform.artifact` provenance at revision 1, and health reported `1 active, 0 archived, 1 revision snapshot(s), 1 artifact payload(s); search index healthy.` The same canonical artifact was exposed by the Space, Relate, Source / meaning, and Share selectors without a duplicate record.

The scoped IndexedDB origin was deleted through the browser test capability and reloaded to `0 active, 0 archived, 0 revision snapshot(s), 0 artifact payload(s); search index healthy.` The temporary fixture was removed from the workspace after the run. This qualifies bounded current-artifact browser attachment, payload retention, shared-reference selector exposure, and test-origin cleanup. Document/photo/receipt preview, OCR, large-file streaming and cancellation/resource bounds, hostile rendering, cross-origin restore, other targets, and release readiness remain open.

## Historical built-artifact Chromium Track, Place, and Compose follow-up

The superseded artifact (`c548ccf`, digest `73aed9623d0b98d40cce3a18f27a68707a830ecb4a032dd8c19621696792b44d`, service-worker cache `omnevum-shell-d2369d0930fda918`) was served at `http://localhost:4230/` in the Codex In-app Browser Chromium surface. The visible Track / Observe form saved two `Sleep` observations (`7.5` and `8` hours) through the same name/unit definition path; the canonical list showed the two `platform.track` observations plus one reusable definition record. The visible Place form saved `Toronto` at `43.6532, -79.3832` as one `platform.place` observation. Health reported `4 active, 0 archived, 4 revision snapshot(s), 0 artifact payload(s); search index healthy.`

The visible Compose / View form then saved `Current track place dashboard` with safe fields for record type, tracker values, and coordinates. The projection reported `4 record(s); projection only.` and rendered a list, table with the requested fields, and descriptive record-type chart while leaving canonical records on their owning command paths. The scoped IndexedDB origin was deleted and reloaded to `0 active, 0 archived, 0 revision snapshot(s), 0 artifact payload(s); search index healthy.` This strengthens the superseded-artifact Track/Observe definition reuse, Place capture, and declarative list/table/chart projection evidence. Mobile hardware/touch and expanded target qualification, GPX/timeline reuse, specialist-domain mapping, permission-sensitive analytics, update survival, and release readiness remain open.

## Historical built-artifact Chromium History/Version revert follow-up

The superseded artifact (`393a324`, digest `e07788f247ba31afc3a3c0b37b2681e6cb3abf2d60d52553877241425da6f9b0`, service-worker cache `omnevum-shell-fc3a70e8de1cdefd`) was served at `http://localhost:4230/` in the Codex In-app Browser Chromium surface. A visible Task capture created `History revert sentinel` at revision 1. Completing the task created revision 2; opening `Revision history (2)` showed the field-level change list `data.status, modifiedAt, revision` and the visible action `Revert to revision 1`.

Activating that action used the canonical History owner and returned the Task to its pre-completion state at revision 3; the `Complete` action was visible again, proving the revert created a new revision rather than copying or deleting the record. The scoped IndexedDB origin was then deleted and reloaded to `0 active, 0 archived, 0 revision snapshot(s), 0 artifact payload(s); search index healthy.` This qualifies that artifact's History/Version diff inspection and user-facing reversion. Domain-specific retention/deletion policy, richer multi-record comparison, other targets, and release readiness remain open.

## Current built-artifact Chromium GPX Acquire follow-up

The current artifact (`f55f1d6`, digest `8791ef02c800df52907a8eb449ad15a82594b5c7ecc8055feef583defe8de661`, service-worker cache `omnevum-shell-44f61fec9fae09c2`) was served at `http://localhost:4230/` in the Codex In-app Browser Chromium surface. The visible Acquire file chooser staged a bounded GPX fixture as `2` reviewable candidates: `observation - Toronto waypoint (HIGH)` and `event - GPX track point 2 (HIGH)`. Accepting the staged source reported `Imported 2 record(s); skipped 0`; the canonical list showed `Toronto waypoint` owned by `platform.place` and `GPX track point 2` owned by `platform.time`.

A scoped canonical-store read verified the imported Place retained latitude `43.6532`, longitude `-79.3832`, and source identity/sequence, while the Time observation retained latitude `43.7`, longitude `-79.4`, start `2026-09-18T12:00:00Z`, and the same source digest with sequence `2`. Health reported `2 active, 0 archived, 2 revision snapshot(s), 0 artifact payload(s); search index healthy.` The scoped IndexedDB origin was deleted and reloaded to zero records, and the temporary GPX fixture was removed. This qualifies bounded GPX staging/review, shared Place/Time owner routing, coordinate/timestamp preservation, source provenance, idempotence-ready candidate identity, and clean-origin recovery. Multi-track route assembly, richer GPX extensions, location-policy controls, large-file/cancellation bounds beyond the staging cap, other targets, and release readiness remain open.
