# Phase 0 launchpad owner-boundary increment

- Authority: `docs/Omnevum-MPES-v0_18_0.md` SHA-256 `103d84308887da9f2eb73caf7eccabb0f68fd14e7c00f876911c9700c15096c8`.
- Product source revision: `93650343b0e46ef2db3c5a36f01bb74f471c79c4` (`bind capture to launchpad owners`).
- Scope: selected existing Omnevum shell; no NeumanOS code, database, localStorage, sync, credential, server, or plugin authority was imported.

## Executable proof

- `npm run typecheck` — PASS.
- `npx vitest run src/core/launchpad-transplant.test.ts src/core/launchpad-transplant.integration.test.ts` — PASS, 2 files / 6 tests.
- `npm test` — PASS, 77 files passed / 358 tests passed / 1 skipped.
- `npm run build` — PASS; relative static PWA build and stamped service worker completed.

`makeLaunchpadRecordInput` and `CommandBus.createLaunchpad` now provide one typed admission seam. Capture routes real user entry through it for Note/Knowledge (`core.knowledge`), Task/Project (`core.task`), Calendar/Time (`platform.time`), and Habit/Routine (`core.progress`). The seam preserves `launchpadFlow`, optional stable source identity, bounded text, owner, revision, provenance, and Vault reconstruction through the existing canonical store. Non-launchpad Capture kinds retain their existing bounded owners; Document/Artifact and Automation keep their existing `CommandBus.createArtifact` and package-automation lifecycle seams.

## Production-preview browser qualification

Target: Codex in-app Chromium, local production preview `http://127.0.0.1:4173/`, build from the source revision above, 2026-09-19 America/Toronto.

The UI created one record for each of Note/Knowledge, Task/Project, Calendar/Time, and Habit/Routine. The rendered canonical list showed these exact owners:

| Flow | Owner | Result |
| --- | --- | --- |
| Note/Knowledge | `core.knowledge` | PASS |
| Task/Project | `core.task` | PASS |
| Calendar/Time | `platform.time` | PASS |
| Habit/Routine | `core.progress` | PASS |

The preview had no console warning/error entries during the four writes. The record list reached ten records in the disposable browser profile, and no donor store or direct IndexedDB write was used by the UI path.

## Boundary and limitation

The integration workload continues to cover all six named flows with stable imported identities, command mutation, duplicate-authority rejection, Vault export/import, idempotent restore, and retained-state reconstruction. This increment adds direct UI proof for four semantic Capture routes. It does not by itself promote OMN-ACC-173 or OMN-ACC-174: Document/Artifact and Automation still require a complete current browser workload plus explicit direct-store rejection and end-to-end Recovery receipt before those rows can become PASS. No status is fabricated.
