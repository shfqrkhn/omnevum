# v0.18.0 launchpad route reassessment receipt

- Date: 2026-09-19 (America/Toronto)
- Authority: `docs/Omnevum-MPES-v0_18_0.md` SHA-256 `103d84308887da9f2eb73caf7eccabb0f68fd14e7c00f876911c9700c15096c8`
- Decision source revision: `dfea7897b05dd64cec84a588ce48eb6c10769fa0`
- Trigger: the exact NeumanOS `v1.5.0` production UI exercise reproduced a Notes/Knowledge React error `#185` on `+ New`; source inspection also found multiple module-owned stores/services that would remain duplicate writable authorities unless substantially replaced.

## Route comparison

| route | retained value | hard-gate/lifecycle result | disposition |
| --- | --- | --- | --- |
| Fork/adapt NeumanOS as retained shell | broad visible productivity surface and five working donor UI writes | Notes failure, module-specific stores, donor persistence/sync assumptions, and owner/Recovery replacement cost make canonical transplantability unqualified | **REJECT retained UI route** |
| Harvest NeumanOS components | interaction and surface patterns can still inform bounded work | only isolated patterns may be reused; donor code/store authority is not admitted | **REFERENCE/SELECTIVE HARVEST** |
| Existing Omnevum greenfield shell plus selective role-specific harvest | already has static-PWA distribution, canonical IndexedDB, command bus, Vault, Recovery, compact responsive profile, and CI/evidence spine | preserves one owner and removes the rejected donor authority; remaining work is explicit contract implementation/qualification | **SELECTED route** |
| Kurumi/OneBench/Utopia as replacement shells | role-specific Capture/Search/sync, workbench, and package-kernel ideas | Kurumi/OneBench data/runtime assumptions and Utopia native/noncommercial terms are not accepted shell foundations | **ROLE-SPECIFIC REFERENCE ONLY** |

## Binding decision

The accepted implementation route is **Omnevum greenfield shell plus selective, contract-bound harvest/reference**. NeumanOS is no longer a retained-UI launchpad. Omnevum canonical owners, semantic commands, provenance, permissions, Vault, Recovery, and Effects remain controlling. No donor code, database, localStorage store, sync identity, credential, server, native runtime, or plugin authority is imported. Future donor-derived behavior must enter through an Omnevum owner adapter with direct-store write traps, stable IDs, Vault reconstruction, migration, and Recovery evidence.

This route closure is evidence for OMN-ACC-176. It does not promote OMN-ACC-173/174/175 or OMN-FOSS-014 to PASS; those remain open until the replacement contract flows and donor-boundary tests are independently qualified.
