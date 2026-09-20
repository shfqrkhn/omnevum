# v0.18.0 OMN-FOSS-014 canonical-core workload receipt

- Date: 2026-09-19 (America/Toronto)
- Authority: `docs/Omnevum-MPES-v0_18_0.md` SHA-256 `103d84308887da9f2eb73caf7eccabb0f68fd14e7c00f876911c9700c15096c8`
- Scope: executable Omnevum-owned six-flow transplant boundary and portable-state workload; candidate evidence only
- Source revision: working-tree candidate after the clean `cdcb0a8` baseline; final commit identity is recorded by Git and regenerated control receipts

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
- `npx vitest run src/core/launchpad-transplant.integration.test.ts src/core/launchpad-transplant.test.ts`: **5 tests passed in 2 files**.
- `npm run typecheck`: **PASS**.

The workload proves the current Omnevum boundary and portable-state mechanics for six synthetic donor identities. It does not yet prove retained NeumanOS UI behavior, real donor code integration, cross-browser behavior, Recovery from injected corruption, human acceptance, or the three-donor comparison against one shared real workload.

## Status disposition

This receipt supports **PARTIAL** evidence for OMN-ACC-173 and OMN-ACC-174 only. OMN-ACC-175/176 and the Phase 0 gate remain open; no release or 100_PERCENT_COMPLETE claim is made.
