# v0.18.0 role-specific donor characterization receipt

- Date: 2026-09-19 (America/Toronto)
- Authority: `docs/Omnevum-MPES-v0_18_0.md` SHA-256 `103d84308887da9f2eb73caf7eccabb0f68fd14e7c00f876911c9700c15096c8`
- Workload: the executable Omnevum six-flow canonical-core workload in `src/core/launchpad-transplant.integration.test.ts`, using stable Note/Knowledge, Task/Project, Calendar/Time, Habit/Routine, Document/Artifact, and Automation identities; source revision `8e64340f8f3513578c5175eca7c1a5cd4f513a53`
- Method: `git ls-remote <repository> HEAD`, exact-commit clone/read of each donor, package/license/source inspection, and a disposable production build/Chromium exercise for the selected NeumanOS launchpad; no donor code was imported into Omnevum

## Exact current source observations

| donor | exact HEAD | package/version | license | observed role-specific value against the same workload |
| --- | --- | --- | --- | --- |
| NeumanOS | `f4b2a174a339fc60524645a19417daedaf69ac91` | `neumanos@1.5.0` | MIT | broadest whole-app overlap: PWA/offline, notes, tasks, calendar, habits, documents, automation, React/Zustand/Dexie, and extensive browser tests; production build passed and five representative UI writes were visible, but Notes creation reproduced React error `#185`; multiple stores/services require canonical-owner transplant before reuse |
| Kurumi | `5453bbb08630d5b36138f8d3dc186b81be1ca93e` | `kurumi@0.0.1` | MIT | role-specific local-first Capture/Knowledge/Search/Sync donor: IndexedDB, Automerge, offline PWA, share target, spatial canvas, and export; document/sync/AI ownership is coupled and remains adapter/reference-only |
| OneBench | `b616bc43e05292bb9e6b4d85cc09f230928d52dc` | `onebench-prototype@0.0.0` | MIT | role-specific modular/static-PWA donor: configuration-driven workbench, package/module/template registry, single-file/PWA output, private-repository upgrade path, and user-owned handoff; ordinary canonical meaning remains unqualified |
| Utopia | `69d02995af94e785be1c850e77056f7b121917ce` | `utopia@1.0.0` | PolyForm-Noncommercial-1.0.0 | role-specific package/app-factory donor: validated JSON packages and operation-kernel direction with package-only habit/expense examples; native Expo/React-Native runtime and noncommercial terms block default static-PWA code adoption |

## Selected launchpad UI qualification

The exact NeumanOS checkout installed with `npm ci --ignore-scripts --no-audit --no-fund` and `npm run build`: **PASS** (`7,254` transformed modules and `255` generated PWA precache entries). A disposable local production preview was exercised in the Codex in-app Chromium browser:

| flow | observed UI result | disposition |
| --- | --- | --- |
| Note/Knowledge | `/notes` opened, but `+ New` produced `Something went wrong loading Notes` with React error `#185` | **PARTIAL/REOPENED** |
| Task/Project | `/tasks` created visible `KAN-1 Omnevum donor task` | **PARTIAL** |
| Calendar/Time | `/schedule` created and reopened visible `Omnevum donor event` in the day detail | **PARTIAL** |
| Habit/Routine | `/tasks?tab=habits` created visible `Omnevum donor routine` | **PARTIAL** |
| Document/Artifact | `/create` created a blank document and the editor displayed `Omnevum donor artifact proof` | **PARTIAL** |
| Automation | `/automations` created an enabled `Omnevum donor rule` with a task-created trigger | **PARTIAL** |

This is real current donor UI evidence, not Omnevum acceptance evidence. The donor exposes module-owned pages/stores and IndexedDB/localStorage services (`src/pages/Notes.tsx`, `Tasks.tsx`, `Docs.tsx`, `Automations.tsx`, `src/services/indexedDB.ts`, `src/lib/syncedStorage.ts`, and multiple `src/stores/use*Store.ts` files); none is admitted as a second writable Omnevum authority.

## Route and boundary decision

- Retain Omnevum's static PWA, command bus, canonical IndexedDB owner, Vault, and Recovery as controlling authorities.
- Keep NeumanOS as the provisional whole-app harvest/reference route pending real retained-UI transplant proof.
- Harvest Kurumi patterns only behind Omnevum Capture/Search/Sync contracts; harvest OneBench packaging/workbench patterns only behind Omnevum package and ownership contracts.
- Admit Utopia as architecture comparison only unless rights and runtime qualification materially change.
- The six-flow workload confirms a common comparison target and explicit donor roles; it does not authorize donor stores, credentials, sync, server, native, or plugin authority.

## Verification and limitations

- Current upstream heads matched the maintained register, including the refreshed OneBench identity.
- The executable workload remained green: `npx vitest run src/core/launchpad-transplant.integration.test.ts src/core/launchpad-transplant.test.ts` passed **5 tests in 2 files**; `npm run typecheck` passed. Full repository CI remains a separate gate and is not inferred from this donor exercise.
- This is **PARTIAL** evidence for OMN-ACC-175 and route-reopen evidence for OMN-ACC-176. It is not a license legal opinion, cross-browser/accessibility/human acceptance, Recovery proof, or launchpad PASS. OMN-ACC-173/174 remain partial.
