# Phase 0 Finance transaction-boundary receipt

Date: 2026-09-20

- Authority: `docs/Omnevum-MPES-v0_18_0.md` SHA-256 `103d84308887da9f2eb73caf7eccabb0f68fd14e7c00f876911c9700c15096c8`.
- Source revision: `2e675def894e2cfd2c2eb5df5804a252e585d7a9` (`2e675de`).
- Benchmark: `npm run benchmark:finance-phase0` -> `FINANCE_PHASE0_BENCHMARK_PASS`.
- Benchmark source SHA-256: `768273799e47b0a4dee7fdc00764ebf3ff273404ad041e008b49d80b4ed2f23a`, defined as the SHA-256 of sorted repository-relative source paths and exact current UTF-8 bytes listed by the benchmark.
- Checks: 23.
- Targeted regression: `npm test -- --run src/core/finance.test.ts src/core/finance-model.test.ts src/core/finance-projection.test.ts` -> 3 files, 49 tests passed; `npm run typecheck` -> pass.

The fresh-process benchmark exercises six credential-free canonical Finance source paths: transaction account, credit card, savings account, debt, income, and investment statement facts. It verifies source classification and account-scoped fingerprints; comma/TSV/facts parsing; lineage and credential-shaped field exclusion; 11 canonical transaction records plus two facts records; exact opening/activity/closing reconciliation; idempotent re-import; renamed overlap; legitimate repeated transactions; ambiguous near-duplicate retention with review state; parser-profile stability and header/sign drift; matched card/internal transfers with an explicit unmatched transfer; missing-source quality state; recurring missing/price/duplicate/refund signals; explainable anomaly/scam-coercion review; dynamic essential-spending goals; non-double-counted allocations and funding alternatives; base/downside/upside forecast vintages and actualization; quiet versus material briefs; bounded what-if propagation; one source reused by Finance/brief/cross-domain projections; one canonical correction with revision history; and a 240-row import path.

This is bounded source/runtime evidence. It does not claim completion of the full acceptance rows. Durable account-specific parser learning/re-detection and routine no-review UX, real live statements/connectors, hostile XLSX/PDF round-trip, cross-origin browser Vault restore, WebKit/Firefox, assistive technology, human acceptance, production rollback, real quota/process faults, security/egress, performance release qualification, tax correctness, investment suitability, or fraud-detection accuracy remain open. Rows `OMN-ACC-133..151` therefore remain `PARTIAL`, not `PASS`.
