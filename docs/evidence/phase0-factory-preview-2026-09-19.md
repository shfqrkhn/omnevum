# v0.18.0 factory and game-preview qualification receipt

- Date: 2026-09-19 (America/Toronto)
- Authority: `docs/Omnevum-MPES-v0_18_0.md` SHA-256 `103d84308887da9f2eb73caf7eccabb0f68fd14e7c00f876911c9700c15096c8`
- Source revision: `810f8f0a8ba43d1237d88375e99e4073aa8b6c32`
- Target: local Vite production preview `http://127.0.0.1:4173/?factory-preview=1`
- Scope: bounded current qualification of the existing declarative record-app and deterministic game factory; this is not a mobile hardware, engine-substitution, or human-acceptance receipt

## Executable proof

| check | result |
| --- | --- |
| `npm run benchmark:factory` | PASS; 1 file / 3 tests |
| `npm run benchmark:factory-interruption` | PASS; deliberate stop and fresh-process resume both passed |
| generated app | Browser form accepted `Fresh factory proof`, `25`, and `factory,portable`; the generated list showed the canonical record at revision 1 |
| generated game | Accessible controls moved twice, collected one star, and saved `Position 2; energy 2; stars 1; cycle 3` |
| reload/restore | After page reload, `Load game` restored `Position 2; energy 2; stars 1; cycle 3` from the canonical package-state path |
| browser errors | Current tab developer log contained no error entries |

## Current source identities

| path | SHA-256 |
| --- | --- |
| `src/core/factory.ts` | `87bf52d3caa22220c17a553b2dedda9c3c304ebfdf01e98989451a6051ce7b19` |
| `src/core/factory-preview.ts` | `8a1e74ff320d6d385a130f846517ecbfd1fa2f94186cec64ee6812d9c215a550` |
| `src/core/game.ts` | `019478a9e7f8c4dd785541f7a8ac7cd0a8ea08a13891af1da9cd43bedda4e42a` |
| `src/ui/app.ts` | `5f117f3072b5a2414b6992453275d5552c95b4ea3d5a950288cf7678828b584e` |

The factory creates a localized declarative package definition and baseline form/list view, routes capture/update/complete through the `CommandBus`, persists game state through the canonical package-state owner, validates declared game actions and save schema, and resumes after an intentional factory-process interruption. The preview is opt-in and does not create a second owner.

## Disposition

This is `PARTIAL` evidence for `OMN-ACC-020` and `OMN-ACC-053`: the current contract, local production preview, persistence, and interruption/resume behavior are proven. Native touch injection, the full admitted mobile matrix, measured accessibility at all density profiles, all theme/localization variants, independent recovery-console proof for game saves, and a fresh-agent/browser human acceptance remain open. No game-engine adoption or Phase 6 gate is claimed.
