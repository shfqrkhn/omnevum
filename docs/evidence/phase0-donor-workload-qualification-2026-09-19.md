# v0.18.0 role-specific donor workload qualification

- Date: 2026-09-19 (America/Toronto)
- Authority: `docs/Omnevum-MPES-v0_18_0.md` SHA-256 `103d84308887da9f2eb73caf7eccabb0f68fd14e7c00f876911c9700c15096c8`
- Omnevum source revision: `a6817e56f634af95e1c3b51cec6f86a8b6832545`
- Scope: close the donor-comparison portion of `OMN-FOSS-014` and `OMN-ACC-175`; no donor source, dependency, asset, database, credential, sync authority, native runtime, or plugin was copied into Omnevum

## Shared executable workload

The same six-flow Omnevum workload was used as the comparison spine: Note/Knowledge, Task/Project, Calendar/Time, Habit/Routine, Document/Artifact, and Automation. The current Omnevum implementation exercised it with:

```text
npx vitest run src/core/launchpad-transplant.integration.test.ts src/core/launchpad-transplant.test.ts
Test Files 2 passed; Tests 6 passed
```

Source hashes at qualification time:

| path | SHA-256 |
| --- | --- |
| `src/core/launchpad-transplant.integration.test.ts` | `af85ef4267784e0e76566521bc3f7f5fc5c05ee1de621ff7af00e152720744fb` |
| `src/core/launchpad-transplant.ts` | `424493e2ddac229a49872c2ea6f36be9c31741fd07fbfbbc8c5adb25b75c1315db` |
| `src/core/commands.ts` | `2ff767519e3ac8e693d65f4901c74156cd0051dc163ac83ee113d309b5e21ed4` |
| `src/core/artifact.ts` | `09bb337ce17f9d4dfa5081b28e7ede0e358a23288a1a367e552cd8f4e69dc901` |

## Exact current donor qualification

| donor | exact HEAD / license | executable observation | role disposition |
| --- | --- | --- | --- |
| NeumanOS | `f4b2a174a339fc60524645a19417daedaf69ac91` / MIT | `npm ci --ignore-scripts --no-audit --no-fund`, production build, and six-flow Chromium exercise; five donor writes were visible and Notes creation reproduced React error `#185` | ADAPT isolated interaction patterns; REPLACE donor stores/services and failed Notes route; retain no donor authority |
| Kurumi | `5453bbb08630d5b36138f8d3dc186b81be1ca93e` / MIT | `npm ci --ignore-scripts --no-audit --no-fund`; `npm run check` PASS (0 errors/0 warnings); `npm test` PASS (3 files/26 tests); `npm run build` PASS | ADAPT Capture/Knowledge/Search mechanics; EXTERNALIZE optional Automerge/sync/AI; replace donor storage/ontology |
| OneBench | `b616bc43e05292bb9e6b4d85cc09f230928d52dc` / MIT | `npm ci --ignore-scripts --no-audit --no-fund`; template/module/registry validators PASS; Windows-compatible Pages build and path verification PASS; `npm test` PASS (31/31) | ADAPT package/workbench and user-owned handoff mechanics; replace localStorage/module authority; keep remote feeds/extensions optional |
| Utopia | `69d02995af94e785be1c850e77056f7b121917ce` / PolyForm-Noncommercial-1.0.0 | exact package/source inspection identified native Expo/React-Native plus server/runtime assumptions; no adoption attempted because rights and static-PWA compatibility are not qualified | GENERALIZE declarative package/operation ideas only; DROP code/runtime adoption; keep architecture reference-only |

## Harvest and boundary map

| capability | disposition | Omnevum owner/seam |
| --- | --- | --- |
| Capture, Note/Knowledge, Search, review interaction | ADAPT/GENERALIZE | `core.knowledge`, `core.commands`, Search/Review contracts |
| Task/Project, Calendar/Time, Habit/Routine meaning | REPLACE/ADAPT | typed launchpad owners and semantic CommandBus mutations |
| Artifact/document intake | ADAPT | `platform.artifact`, inspection and provenance path |
| Automation/package lifecycle | GENERALIZE/ADAPT | package contract, proposal router, permission/effect boundary, Vault/Recovery |
| localStorage, donor IndexedDB/Dexie, Automerge, module stores | REPLACE/DROP | canonical Omnevum store only; no synchronized writable copy |
| sync, remote feeds, AI, native APIs, executable extensions | EXTERNALIZE/DEFER | optional capability policies; no baseline platform requirement |

The Omnevum owner-bound workload rejects writable legacy stores and admits read-only donor seams only. Stable identities, semantic commands, provenance, Vault export/import, idempotent restore, and Recovery remain Omnevum-owned. Exact licenses and source heads are recorded in `docs/control/upstream.json`; route decisions and boundaries are recorded in `docs/control/patch-fork-delta.json` and `docs/control/capability-coverage.json`.

## Result

This closes the at-least-three role-specific donor comparison and exact current license/provenance/boundary requirements for `OMN-ACC-175`. It also closes `OMN-FOSS-014` for the selected Omnevum-shell-plus-selective-harvest route: the six representative flows preserve useful behavior through Omnevum contracts, while the rejected donor UI and all duplicate writable authorities remain outside the product.

This is not a release, browser-family, accessibility, quota, rollback, security/egress, or human-acceptance PASS. Phase 0 remains `IN_PROGRESS`; all unrelated `PARTIAL` and `UNKNOWN` rows remain release-visible.
