# v0.18.0 security, optional-capability, effect, and context-boundary receipt

- Date: 2026-09-19 (America/Toronto)
- Source revision: `5af3009fb284130f248b96737c271ed1216a3408`
- Command: `npx vitest run src/core/ai-route-policy.test.ts src/core/credential.test.ts src/core/effect-guard.test.ts src/core/effect-service.test.ts src/core/effect-runner.test.ts src/core/extension-policy.test.ts src/core/package-automation.test.ts src/core/package-automation-runtime.test.ts src/core/remote.test.ts src/core/security-contracts.test.ts src/core/share.test.ts src/core/sharing.test.ts src/core/sync.test.ts src/core/sync-routes.test.ts src/core/tool-broker.test.ts src/core/context-export.test.ts`
- Result: 16 files passed; 66 tests passed; duration 406 ms

## Covered executable contracts

- AI route policy admits only declared official/entitled routes, stops at uncertain or exhausted quota, blocks piggyback techniques, and requires current terms plus core authority for reverse writes.
- Credential use returns opaque metadata, keeps reusable secrets out of persisted/model-visible payloads, supports revocation, and gates effects through the broker.
- Effect creation rejects insecure destinations and credential-shaped payloads; guard state revalidates authority, Space, disclosure, schema, destination, credentials, and revocation before execution.
- Interrupted, retryable, ambiguous, expired, revoked, or concurrently claimed effects remain durable and visible in the correct Recovery/reconciliation state without blind duplicate replay.
- Remote adapters validate HTTPS/local fixtures, bounded responses, idempotency, and ambiguous-response reconciliation; sync routes preserve logical IDs across provider-neutral adapters while manual Vault/owner-controlled paths remain usable without provider secrets.
- Declarative automation is proposal-only, bounded, scope/permission/command-declared, and rejects malformed/oversized or executable input. Executable third-party packages are disabled by policy.
- Tool-broker input cannot widen context, execute malicious commands, accept changed schemas, or mutate core outside the normal proposal/command path; loss of the endpoint leaves core state untouched.
- Sharing and context export apply explicit record/Space/disclosure scope, exclude private/credential content, retain provenance/truth/derived/conflict metadata, support Markdown/plain/JSON/JSONL/CSV/TSV, refuse misleading hierarchy flattening, and expose budget omissions and deltas.

## Source hashes

- `src/core/ai-route-policy.ts`: `f3892c19dc01b9e766fadba832d1a0c1fa4a39282df6ddb7fa38ef83fab8b27a`
- `src/core/credential.ts`: `3fd5dc26dfef7d73cb07924b3377b817910da43f878011ef1835dd6d526e899e`
- `src/core/effect-guard.ts`: `793bf597dab2ede9416bc1cc68290f11e95555325f83031f2e949fc734191127`
- `src/core/effect-service.ts`: `4a6429d2f5e2b27ba45382df8fccb5392a8627899e5db885052b1bacac2e2fde`
- `src/core/effect-runner.ts`: `9d24bb03b0227fa3ef17644fe7ccfac0ef716d2a558df5d00b5bbad961ed1a93`
- `src/core/extension-policy.ts`: `c2b0ec59be89d6bec1b37716c8884dd3a3a8fc4eb881f8a2d37242ea9d75c36d`
- `src/core/package-automation-runtime.ts`: `02fb317aee82d9cfbdf14146d4a4a15c994e0b2d459a65ddbf5e4c12912020b6`
- `src/core/remote.ts`: `d0dba46fd05ce59e28ea748bb0aa31830cfa08636a173ad2e836de6676be1114`
- `src/core/tool-broker.ts`: `292e1d943d66952fef2179e73e112bcb06b0557b14ebb9a86d263c045270c317`
- `src/core/context-export.ts`: `26d5244105815ad08a4f8d4a9544a1ec3fe2e5bef6c5d63cdb1bbb47e6842252`

## Boundaries

This is executable contract characterization, not a release PASS. It does not prove browser permission prompts, hostile real network/tool endpoints, cross-browser behavior, real credential-provider enrollment, human acceptance, or full AI/sync/product-domain completion.
