# v0.18.0 OMN-FOSS-014 canonical-core workload receipt

- Date: 2026-09-19 (America/Toronto)
- Authority: `docs/Omnevum-MPES-v0_18_0.md` SHA-256 `103d84308887da9f2eb73caf7eccabb0f68fd14e7c00f876911c9700c15096c8`
- Scope: executable Omnevum-owned six-flow transplant boundary and portable-state workload; candidate evidence only
- Source revision: `8e64340f8f3513578c5175eca7c1a5cd4f513a53`

## Current upstream identities

The exact current `HEAD` values were checked with `git ls-remote <source> HEAD` on this date:

| role | source | HEAD | license | disposition |
| --- | --- | --- | --- | --- |
| launchpad | `https://github.com/travisjneuman/neumanos` | `f4b2a174a339fc60524645a19417daedaf69ac91` | MIT | harvest reference |
| Capture/Search/sync donor | `https://github.com/raskell-io/kurumi` | `5453bbb08630d5b36138f8d3dc186b81be1ca93e` | MIT | harvest reference |
| modular/static-PWA donor | `https://github.com/diyiwuyan/onebench` | `b616bc43e05292bb9e6b4d85cc09f230928d52dc` | MIT | harvest reference |
| package/app-factory donor | `https://github.com/vaddisrinivas/utopia` | `69d02995af94e785be1c850e77056f7b121917ce` | PolyForm-Noncommercial-1.0.0 | architecture reference only |

No donor code, server, native runtime, credential, sync authority, or plugin authority was imported.

## Executable proof

- `src/core/launchpad-transplant.integration.test.ts` exercises all six required flows with stable source and canonical identities, command-owned create/update mutations, artifact persistence, duplicate writable-authority rejection, read-only retained seams, derived Search, Vault export/import, idempotent re-import, and retained-state reconstruction.
- `src/core/commands.ts` admits a bounded stable canonical identity only through the command path; ordinary user-created records retain generated opaque IDs. `src/core/artifact.ts` carries the same bounded identity seam for imported Artifacts.
- `src/core/launchpad-transplant.ts` maps Calendar/Time, Document/Artifact, and Automation to existing platform owners; Note/Knowledge, Task/Project, and Habit/Routine are explicit contract-spike owners in `docs/control/owner-registry.json`.
- Source hashes: `src/core/launchpad-transplant.integration.test.ts` `2af441c504e03f7cd7552a4602b004a8d87ddc7dad4d813bb16b2a1b9906f7fe`; `src/core/commands.ts` `209795cc9a6eb968101f3264f9924e3bb7aca14d9f94af59f352b69f029a8d04`; `src/core/artifact.ts` `09bb337ce17f9d4dfa5081b28e7ede0e358a23288a1a367e552cd8f4e69dc901`.
- `npx vitest run src/core/launchpad-transplant.integration.test.ts src/core/launchpad-transplant.test.ts`: **5 tests passed in 2 files**.
- `npm run typecheck`: **PASS**.

The workload proves the current Omnevum boundary and portable-state mechanics for six synthetic donor identities. It does not yet prove retained NeumanOS UI behavior, real donor code integration, cross-browser behavior, Recovery from injected corruption, human acceptance, or the three-donor comparison against one shared real workload.

## Exact-donor runtime qualification

- The four repositories were cloned into disposable directories outside the tracked repository at the exact heads above; no donor source, dependency, asset, credential, server, native runtime, or plugin authority was copied into Omnevum.
- NeumanOS `v1.5.0` installed with `npm ci --ignore-scripts --no-audit --no-fund` and built with `npm run build`: **PASS** (`7,254` modules transformed; `255` PWA precache entries). The build emitted only a stale Browserslist-data warning; it did not alter Omnevum.
- Its production preview was opened at `http://127.0.0.1:4369/` in the Codex in-app Chromium browser. The disposable profile used only local test data.

| retained flow | exact UI action and observed result | qualification |
| --- | --- | --- |
| Note/Knowledge | `/notes` → open Notes menu → `+ New`; the screen changed to `Something went wrong loading Notes` with React error `#185` and a `Try Again` recovery action | **PARTIAL/REOPENED**; retained UI is not admitted, and the failure is a donor defect to isolate before any harvest |
| Task/Project | `/tasks` → `+ Add task` → `Omnevum donor task`; visible card `KAN-1` appeared in Backlog | **PARTIAL**; UI creation works, but the donor Kanban store remains a second authority |
| Calendar/Time | `/schedule` → `New Event` → `Omnevum donor event`; day detail showed `1 event` and `Omnevum donor event — All day` | **PARTIAL**; Calendar UI creation works, but Time Tracking and owner migration remain unqualified |
| Habit/Routine | `/tasks?tab=habits` → `Add Habit` → `Omnevum donor routine`; visible daily habit card appeared | **PARTIAL**; donor habit store remains unqualified |
| Document/Artifact | `/create` → `Document` → `Blank Document`; editor accepted `Omnevum donor artifact proof` and displayed it in the contenteditable editor | **PARTIAL**; donor document store/editor is not an Omnevum owner |
| Automation | `/automations` → `+ New Rule` → `Omnevum donor rule`; enabled rule showed `Trigger: task → created` and one action | **PARTIAL**; donor automation store/action semantics remain outside the Omnevum command boundary |

The retained UI exercise is a current Chromium qualification only. It does not prove WebKit/Firefox behavior, accessibility acceptance, cross-origin Vault restore, donor Recovery, or direct-store write interception. The exact source also exposes module-specific stores/services (`src/pages/Notes.tsx`, `Tasks.tsx`, `Docs.tsx`, `Automations.tsx`, `src/services/indexedDB.ts`, `src/lib/syncedStorage.ts`, and multiple `src/stores/use*Store.ts` owners), so whole-app retention remains rejected pending a bounded adapter or a deliberate harvest/greenfield decision.

## Status disposition

This receipt supports **PARTIAL** evidence for OMN-ACC-173, OMN-ACC-174, and OMN-ACC-176. OMN-ACC-175 remains **PARTIAL** through the companion donor-characterization receipt; Phase 0 remains open and no release or 100_PERCENT_COMPLETE claim is made.
