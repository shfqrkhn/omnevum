# v0.18.0 role-specific donor characterization receipt

- Date: 2026-09-19 (America/Toronto)
- Authority: `docs/Omnevum-MPES-v0_18_0.md` SHA-256 `103d84308887da9f2eb73caf7eccabb0f68fd14e7c00f876911c9700c15096c8`
- Workload: the executable Omnevum six-flow canonical-core workload in `src/core/launchpad-transplant.integration.test.ts`, using stable Note/Knowledge, Task/Project, Calendar/Time, Habit/Routine, Document/Artifact, and Automation identities; source revision `4d9fc7c8cb54134511b19e12c7edd4778c008bf1`
- Method: `git ls-remote <repository> HEAD`, then exact-commit reads of `README.md`, `package.json`, and `LICENSE` through the GitHub raw-content endpoint; no donor code was imported or executed

## Exact current source observations

| donor | exact HEAD | package/version | license | observed role-specific value against the same workload |
| --- | --- | --- | --- | --- |
| NeumanOS | `f4b2a174a339fc60524645a19417daedaf69ac91` | `neumanos@1.5.0` | MIT | broadest whole-app overlap: PWA/offline, notes, tasks, calendar, habits, documents, automation, React/Zustand/Dexie, and extensive browser tests; multiple module stores/services require canonical-owner transplant before reuse |
| Kurumi | `5453bbb08630d5b36138f8d3dc186b81be1ca93e` | `kurumi@0.0.1` | MIT | role-specific local-first Capture/Knowledge/Search/Sync donor: IndexedDB, Automerge, offline PWA, share target, spatial canvas, and export; document/sync/AI ownership is coupled and remains adapter/reference-only |
| OneBench | `b616bc43e05292bb9e6b4d85cc09f230928d52dc` | `onebench-prototype@0.0.0` | MIT | role-specific modular/static-PWA donor: configuration-driven workbench, package/module/template registry, single-file/PWA output, private-repository upgrade path, and user-owned handoff; ordinary canonical meaning remains unqualified |
| Utopia | `69d02995af94e785be1c850e77056f7b121917ce` | `utopia@1.0.0` | PolyForm-Noncommercial-1.0.0 | role-specific package/app-factory donor: validated JSON packages and operation-kernel direction with package-only habit/expense examples; native Expo/React-Native runtime and noncommercial terms block default static-PWA code adoption |

## Route and boundary decision

- Retain Omnevum's static PWA, command bus, canonical IndexedDB owner, Vault, and Recovery as controlling authorities.
- Keep NeumanOS as the provisional whole-app harvest/reference route pending real retained-UI transplant proof.
- Harvest Kurumi patterns only behind Omnevum Capture/Search/Sync contracts; harvest OneBench packaging/workbench patterns only behind Omnevum package and ownership contracts.
- Admit Utopia as architecture comparison only unless rights and runtime qualification materially change.
- The six-flow workload confirms a common comparison target and explicit donor roles; it does not authorize donor stores, credentials, sync, server, native, or plugin authority.

## Verification and limitations

- Current upstream heads matched the maintained register, including the refreshed OneBench identity.
- The executable workload remained green: 5 focused tests passed in 2 files; full `npm run ci` passed at source `4d9fc7c8cb54134511b19e12c7edd4778c008bf1`.
- This is **PARTIAL** evidence for OMN-ACC-175. It is not a donor runtime/UI qualification, human acceptance, cross-browser proof, license legal opinion, or launchpad PASS. OMN-ACC-173/174 remain partial and OMN-ACC-176 remains open.
