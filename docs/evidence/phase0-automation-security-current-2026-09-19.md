# Phase 0 declarative automation security receipt

- Authority: `docs/Omnevum-MPES-v0_18_0.md` SHA-256 `103d84308887da9f2eb73caf7eccabb0f68fd14e7c00f876911c9700c15096c8`.
- Current source revision: `167f1309b4a3866b500c98c4d689f95f0e4cb9cb`.
- Scope: first-party/declarative package automation only; executable third-party packages remain unqualified and disabled.

## Executable proof

Command: `npx vitest run src/core/package-automation.test.ts src/core/package-automation-registry.test.ts src/core/package-automation-runtime.test.ts src/core/launchpad-automation.integration.test.ts src/core/proposal-router.test.ts`

Result: **PASS**, 5 files / 14 tests.

The current tests prove that malformed, oversized, wrong-package, undeclared-command, missing-permission, and executable-unqualified package inputs are rejected; accepted rules are frozen declarative data and emit proposals only. Lifecycle/package disable suppresses proposals. Applying a proposal requires explicit confirmation, an authorized record scope, safe non-authority fields, current package ownership, and the normal `CommandBus` path. The real-store launchpad test additionally proves persisted rule state, stable record scope, Vault export/import, and fresh-runtime restore.

No automation path receives direct credential, network, storage, or external-effect authority: the first-party manifest declares no external effects, package rules contain bounded scalar arguments, and unsupported commands fail closed. This receipt is current contract/security evidence, not browser, human, cross-engine, or release completion evidence.
