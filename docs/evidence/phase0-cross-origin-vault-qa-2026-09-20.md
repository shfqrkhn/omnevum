# Phase 0 cross-origin Vault QA — 2026-09-20

## Scope

This receipt records a bounded local browser qualification for cross-origin Vault portability. It is evidence for the existing `PARTIAL` state of `OMN-ACC-010` and `OMN-ACC-018`; it does not claim a materially different browser-family, production, or human-acceptance PASS.

## Identity

- Active authorities: `docs/Omnevum-MPES-v0_18_0.md` SHA-256 `103d84308887da9f2eb73caf7eccabb0f68fd14e7c00f876911c9700c15096c8`; `docs/Omni_3.32.0.md` SHA-256 `061a15a918c3713075244ddcd548e7c3c946fd4bcb1e12b6995bdd777adc3d2b`.
- Source revision: `807673733d3851666ed5b1463438db9ce35d7bb3`.
- Local artifact digest: `661277ee844644606ad5a575135492c29412a013f1995c290dfd358e50f534f4`; service-worker cache `omnevum-shell-32eccddf2a11ae89`.
- Target: local Vite static preview, `npm run preview -- --host 0.0.0.0 --port 4175`.
- Browser: Chromium via Chrome DevTools MCP; isolated contexts `omn-cross-origin-a` and `omn-cross-origin-b`; mobile emulation `390x844`, DPR 2, touch enabled.

## Observed procedure and result

1. At `http://127.0.0.1:4175/`, the UI created one synthetic note (`Cross-origin Vault QA synthetic record`) and exported a full Vault. The UI reported `1 record(s), 0 artifact payload(s), 1928 bytes`.
2. At the distinct origin `http://localhost:4175/`, a synthetic `File` was supplied to the normal Import Vault input through the browser `DataTransfer` API because the DevTools file-path bridge was not available. No user data, credentials, or network connector was used.
3. The normal preview dialog reported `1 record(s), 0 history entries, 0 artifact payload(s); 1 will import, 0 will skip`. Confirming it reported `Imported 1 record(s); skipped 0.`
4. IndexedDB inspection on the destination origin found database `omnevum-canonical-v1`, store `records`, and preserved ID `record_9e44aa89-5609-4f1f-b073-f92b6d3aa086`.
5. The destination UI showed one active `Personal - Note` record. Lighthouse mobile snapshot returned Accessibility `100` and Best Practices `100` for this candidate.

## Qualification boundary

This proves the implemented Vault import/export path across two distinct origins within one Chromium family with confirmation and semantic ID preservation. It does not prove Safari/WebKit or Firefox behavior, native quota/eviction/fault injection, production rollback, Finance-specific end-to-end restore, or human acceptance. `OMN-ACC-010`, `OMN-ACC-018`, and dependent rows remain `PARTIAL` until those independent targets are qualified.
