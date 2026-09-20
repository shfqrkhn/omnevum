# Phase 0 Finance import/correction and hosted-identity receipt

- Date: 2026-09-20 (America/Toronto).
- Authority: `docs/Omnevum-MPES-v0_18_0.md` SHA-256 `103d84308887da9f2eb73caf7eccabb0f68fd14e7c00f876911c9700c15096c8`.
- Application source revision exercised: `0d54f57dd21341104ef1dea0b76a8ec6639a5496`.
- Exact source hashes: `src/ui/app.ts` `5f117f3072b5a2414b6992453275d5552c95b4ea3d5a950288cf7678828b584e`; `src/core/finance.ts` `73999bc05b16a55081da81c55a1f4878f3fb37df5735e38552801500c8552fde`; `src/core/finance-model.ts` `b36c88f5c4fb75578308abda3eadfa73dcbf9f89ce2dda7e1eb9a124b0ae7344`; `src/core/finance-projection.ts` `10c6d680467712bdaaa43963ec34bda66ebefd5674492fa0f0fd2ac559ba501a`.
- Product artifact digest: `462875502ec63ffccedd707fb558745805252ab84eda294213a2542e4665d699`.
- Service-worker cache: `omnevum-shell-5738511387984ad7`.
- Hosted target: `https://shfqrkhn.github.io/omnevum/`.
- Repository CI: [run 35487695338](https://github.com/shfqrkhn/omnevum/actions/runs/35487695338) — PASS.
- Pages build/deploy and published-entry smoke: [run 35487695353](https://github.com/shfqrkhn/omnevum/actions/runs/35487695353) — PASS.

## Hosted artifact check

On 2026-09-20, a Node `fetch` comparison against the hosted target returned HTTP 200 and matched byte length and SHA-256 for all 8 current local `dist/` files. This proves the current hosted identity for source `0d54f57`; it does not prove production rollback or release readiness.

## Finance user-flow check

- Target: isolated local static preview `http://localhost:4173/`, source `0d54f57`.
- Browser: Microsoft Edge `153.0.0.0` on Windows (`Edg/153.0.0.0`).
- Fixture: synthetic local CSV with three rows (`Payroll 3000 POSTED`, `Rent -1200 POSTED`, `Pending card -75 PENDING`); no user file or credential was used. The browser file-picker bridge was unavailable, so the same local fixture was supplied as an in-page `File` object in the disposable QA tab; no repository runtime code was changed.
- Steps observed: enabled the optional Domains surface through Presentation, supplied account identity `qa-checking` and opening/closing balances `0`/`1725`, reviewed the explicit batch preview showing 1 reconciliation exception, confirmed once, and accepted 3 transactions plus the preserved Artifact. The UI reported income `$3,000.00`, spending `$1,200.00`, net cash flow `$1,800.00`, and pending `-$75.00`; record count was 4 (one Artifact plus three Finance records).
- Correction: selected the imported Payroll record, changed its amount to `3050`, and saved once. The UI reported canonical revision 2, refreshed income `$3,050.00` and net cash flow `$1,850.00`, showed one-source change impact and an evidence-linked Finance update brief, and kept record count at 4.
- Reload: after a fresh page reload, the correction selector showed Payroll at revision 2 and the Finance projection retained income `$3,050.00`; console error log was empty (`[]`).

## Disposition

This receipt supports bounded `PARTIAL` updates for OMN-ACC-146, OMN-ACC-148, OMN-ACC-150, OMN-ACC-151, and OMN-ACC-153. It does not claim a mixed-source batch, duplicate-import benchmark, learned parser drift, transfer matching, multi-goal/forecast/anomaly coverage, cross-origin Finance Vault restore, hostile-file proof, other browser families, assistive technology, touch hardware, rollback, or human acceptance. Those rows remain UNKNOWN or otherwise release-visible until separately proven.
