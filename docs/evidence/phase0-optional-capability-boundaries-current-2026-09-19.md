# Phase 0 optional-capability boundary receipt

- Authority: `docs/Omnevum-MPES-v0_18_0.md` SHA-256 `103d84308887da9f2eb73caf7eccabb0f68fd14e7c00f876911c9700c15096c8`.
- Current source revision: `75df8db865dfe69ba0f52bcff9638778033f9953`.
- Command: `npx vitest run src/core/ai-route-policy.test.ts src/core/extension-policy.test.ts src/core/credential.test.ts src/core/effect-guard.test.ts src/core/tool-broker.test.ts`.
- Result: **PASS**, 5 files / 12 tests.

The current AI route policy admits only an official entitled bounded route, blocks consumer-web/OAuth piggyback and stale browser automation with `TERMS_BLOCKED`, stops uncertain/exhausted quota without automatic billing or fallback, and requires the semantic command, permission, and Effect/Outbox boundaries for external writes. The extension policy admits declarative data-only extensions and returns `DISABLED_UNQUALIFIED` for executable extensions because no isolation substrate is claimed. Credential/effect/tool tests additionally keep secrets opaque, enforce revocation, and reject changed or malicious tool schemas without core mutation.

This closes only the truthful terms-boundary and executable-extension-disablement contracts represented by OMN-ACC-075 and OMN-ACC-082. It does not claim live provider enrollment, live tool endpoints, executable isolation, or human acceptance.
