# Phase 0 launchpad automation and artifact increment

- Authority: `docs/Omnevum-MPES-v0_18_0.md` SHA-256 `103d84308887da9f2eb73caf7eccabb0f68fd14e7c00f876911c9700c15096c8`.
- Product source revision: `4fa52945d42ad2017815c5aeeda86fcbe5048344` (`prove automation Vault recovery on canonical store`).
- App artifact identity remains the previously byte-verified local/Pages candidate: digest `462875502ec63ffccedd707fb558745805252ab84eda294213a2542e4665d699`, service-worker cache `omnevum-shell-5738511387984ad7`. The increment is test/evidence-only and does not change shipped `dist/` bytes.
- Scope: the selected Omnevum shell only. No deprecated specification, donor database, localStorage, sync, credential, server, or plugin authority was imported.

## Executable canonical-store proof

`src/core/launchpad-automation.integration.test.ts` exercises the real `CanonicalStore`, `CommandBus`, `PackageAutomationRuntime`, `PackageAutomationRegistry`, and first-party `omnevum.automation` package manifest:

1. Create one canonical Note/Knowledge record through `CommandBus`.
2. Install a package-scoped manual rule; persist its lifecycle state through the canonical store.
3. Generate a proposal, confirm it with an explicit record scope, and apply it through the existing `CommandBus` update path.
4. Export the source Vault and import it into a separate store.
5. Recreate the package registry/runtime, restore the rule from imported Vault state, and verify the restored rule previews against the same stable canonical ID and the updated record survives.

Targeted result: `npm test -- --run src/core/launchpad-automation.integration.test.ts` — PASS, 1 file / 1 test. `npm run typecheck` — PASS.

This proves durable Automation lifecycle/proposal state and a confirmed mutation across a real Vault boundary without granting Automation a second writable canonical store. Existing launchpad integration continues to cover all six named flows, stable imported identities, duplicate-authority rejection, idempotent Vault restore, and retained-state reconstruction.

## Current browser qualification

Target: Codex in-app Chromium, local production preview `http://127.0.0.1:4173/`, built from the current app source, 2026-09-19 America/Toronto.

- Automation UI: install a declarative manual rule, reload, preview one proposal, confirm the UI dialog, and apply it through the normal command path — PASS; no console warning/error entries.
- Artifact UI: a retained `README.md` artifact row remained visible with owner `platform.artifact`, revision 1, after reload — PASS for retained-record display and persistence.
- Direct fresh file-picker injection could not be completed through the current Codex in-app browser adapter (filechooser timed out). No fresh picker/upload PASS is claimed; the limitation remains release-visible.

## Boundary

This increment strengthens OMN-ACC-173/174 evidence but does not promote either row: fresh current Document/Artifact intake, explicit direct-store rejection receipt, complete Recovery proof, and all mandatory platform/browser/human gates remain open. No status is fabricated.
