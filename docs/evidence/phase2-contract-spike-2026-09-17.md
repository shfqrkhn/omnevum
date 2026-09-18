# Phase 2 and optional-capability contract spike receipt

Date: 2026-09-17  
Status: CONTRACT_SPIKE; no provider, target, release, or human-acceptance claim

## Reproducible run

- Command: `npm run typecheck`
- Command: `npm test -- --reporter=verbose`
- Result: PASS; 40 test files and 106 tests passed in the local repository environment.
- The suite includes `src/core/crypto.test.ts`, `src/core/remote.test.ts`, `src/core/sync.test.ts`, `src/core/sync-routes.test.ts`, `src/core/effect-runner.test.ts`, `src/core/credential.test.ts`, `src/core/ai.test.ts`, `src/core/migration.test.ts`, `src/core/package-contract.test.ts`, `src/core/game.test.ts`, `src/core/automation.test.ts`, and `src/core/extension-policy.test.ts`; the receipt-time repository run was `40` files and `111` tests.

## Established by the spike

- Encrypted Vault uses an explicit envelope and password-derived key; the password is not persisted in the canonical store.
- Provider-neutral replica merge preserves tombstones, surfaces equal-revision semantic divergence, and requires an explicit restore intent to rejoin deleted meaning.
- Remote transports require a bounded HTTPS/localhost endpoint and validate pulled canonical records before admission.
- Effect/Outbox state is platform-owned; interrupted operations become `OUTCOME_UNKNOWN`/`RECONCILE`, and replay requires a distinct reconciliation adapter plus current authorization.
- Credential metadata is opaque and secret-free; AI context is explicit, bounded, disclosure-checked, proposal-only, and removable from core operation.
- Migration, package, game, declarative automation, and disabled executable-extension contracts fail closed on incompatible or unqualified inputs. The added adversarial contract tests cover recursion/property traversal, effect bounds, package/game validation, and malformed runtime state.

## Not established

No external provider, WebAuthn/passkey, SelfStore/remoteStorage adoption, large incremental repository, target-browser matrix, mobile/performance result, live AI route, MCP endpoint, executable sandbox, or production release is claimed. The current runtime remains a native IndexedDB/static-core implementation with optional contracts behind explicit seams.

## Current verification follow-up (2026-09-18)

The current repository run is `npm run ci`: control generation `393` requirements / `98` acceptance / `87` packages, structure/reference/acceptance/architecture/static/drift audits PASS, typecheck PASS, `42` test files and `140` tests PASS, build/service-worker stamping PASS, zero high-severity npm vulnerabilities, and FOSS compliance `PASS_WITH_REVIEW_LIMITATIONS`. The latest exact artifact receipt is source `bd9e242`, digest `21573b205032581c9efa72bb6a70fdfc693c9785204774216808e1541d676e3c`, cache `omnevum-shell-bb5235f9801ca7f8`.

The spike decisions remain unchanged. This refresh strengthens repository-control evidence only; external provider, passkey, target-browser, mobile/performance, live AI, MCP, executable sandbox, and production-release qualification remain open.
