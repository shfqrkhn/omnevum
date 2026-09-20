# v0.18.0 current canonical-core transplantability receipt

- Date: 2026-09-20 (America/Toronto)
- Authority: `docs/Omnevum-MPES-v0_18_0.md` SHA-256 `103d84308887da9f2eb73caf7eccabb0f68fd14e7c00f876911c9700c15096c8`
- Source revision: `aca722b568008a526b25287fb61e44ebbf509b0e` (`prove canonical launchpad transplant boundary`)
- Benchmark: `npm run benchmark:launchpad-transplant` — **PASS**, 25 checks
- Composite source SHA-256: `0a8766b96a1d024b8d8055752ea089dd89cb06acb0d09fbf5f7c0cfb313f3a92`
- Working tree at observation: clean

## One executable workload

The current process benchmark runs the same six-flow workload through the real
Omnevum `CanonicalStore` and `CommandBus`, using exact stable source and
canonical identities:

| flow | source identity | canonical identity | Omnevum owner |
| --- | --- | --- | --- |
| Note/Knowledge | `neumanos:note:42` | `omnevum:launchpad:note-42` | `core.knowledge` |
| Task/Project | `neumanos:task:17` | `omnevum:launchpad:task-17` | `core.task` |
| Calendar/Time | `neumanos:event:2026-09-20` | `omnevum:launchpad:event-2026-09-20` | `platform.time` |
| Habit/Routine | `neumanos:habit:walk` | `omnevum:launchpad:habit-walk` | `core.progress` |
| Document/Artifact | `neumanos:document:receipt-7` | `omnevum:launchpad:artifact-receipt-7` | `platform.artifact` |
| Automation | `neumanos:automation:review` | `omnevum:launchpad:automation-review` | `platform.automation` |

For every flow the benchmark verifies: exact six-flow coverage; owner-bound
command admission; rejection of a writable, conflicting legacy store; a
read-only retained seam; stable identity/provenance; revision-2 update through
the canonical command path; derived Search; six-record Vault export; 12 history
entries; idempotent restore (`6` imported, then `6` skipped, `0` conflicts);
stable identity/owner/revision after restore; and retained-state export after
recovery.

The direct-write proof is fail-closed: `admitLaunchpadMutation` returns
`REJECT_DIRECT_STORE` for every writable candidate and keeps the validated
mutation only for the Omnevum `CommandBus` path. The benchmark observed zero
legacy-write side effects. Production architecture audit continues to enforce
one IndexedDB owner and no direct storage-object access outside
`src/core/storage.ts`.

## Donor and route disposition

The exact current NeumanOS, Kurumi, OneBench, and Utopia identities, licenses,
runtime observations, and role-specific retain/adapt/generalize/replace/
externalize/drop map remain recorded in
`docs/evidence/phase0-donor-workload-qualification-2026-09-19.md` and
`docs/control/upstream.json`. No donor source, database, localStorage,
credential, sync authority, native runtime, or plugin was imported.

The route remains Omnevum's shell plus selective contract-bound harvest. The
NeumanOS retained-UI route was explicitly reopened and rejected after its
Notes failure and duplicate-store inspection; Kurumi and OneBench remain
role-specific references, and Utopia remains architecture-only because its
license/runtime is not qualified for code adoption. Unchanged evidence does not
trigger route churn.

## Qualification boundary

This receipt supports current PASS evidence for `OMN-FOSS-014` and
`OMN-ACC-173..176` for the selected route. It does not prove donor UI
retention, WebKit/Firefox, assistive technology, human acceptance, production
rollback, real quota/process faults, live security/egress, or release
readiness; those remain separately release-visible.
