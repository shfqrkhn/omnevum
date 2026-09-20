# Phase 0 Finance classification, overlap, and compact target receipt

- Date: 2026-09-20 (America/Toronto)
- Authority: `docs/Omnevum-MPES-v0_18_0.md` SHA-256 `103d84308887da9f2eb73caf7eccabb0f68fd14e7c00f876911c9700c15096c8`
- Product source revision: `4257272` (`qualify compact touch targets`, with Finance classifier fix `2f1424e`)
- Local rebuilt target: `http://127.0.0.1:4174/` from `npm run build`
- Edge UA: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0`
- Artifact identity: digest `0dc1337fb513c435568582dd5a46b314daea5ab9c7cf85d64da360f7a1cd1b00`; service-worker cache `omnevum-shell-a8cc71ee3603b276`

## Observed flow

Synthetic, non-user, in-page `File` objects were used because the browser file-picker bridge did not expose path assignment. No user file, credential, financial-institution connection, or external destination was used. The QA tab was isolated to the local preview origin.

1. Enabled the low-frequency Domains section through the existing Presentation UI; compact default remained unchanged for a fresh profile.
2. Submitted `credit-card-statement.csv` containing only `StatementBalance`, `DueDate`, `MinimumDue`, `GracePeriodDays`, `InterestTerms`, and `CreditLimit`. The batch confirmation showed `1 source(s), 0 transaction row(s), 1 exception(s)` and acceptance persisted one source with one explicit incomplete-reconciliation exception. This directly exercises separator-normalized source classification; the regression is in `src/core/finance-model.test.ts`.
3. Submitted three facts-only files named `credit-card-statement.csv`, `investment-statement.csv`, and `insurance-statement.csv`. Confirmation showed `3 source(s), 0 transaction row(s), 3 exception(s)`; acceptance persisted all three source artifacts/facts and reported each incomplete reconciliation explicitly. Active record count was `8`; browser error log was empty.
4. Submitted one transaction row from `checking.csv`: acceptance reported `1 new transaction`. Re-submitted the identical bytes as `renamed-checking.csv`: acceptance reported `0 new transaction(s), 1 existing transaction(s)`. The source-specific reconciliation limitation remained visible; no duplicate canonical transaction was created.
5. Emulated `320x900`, set the existing presentation profile to `200%` text scale, and measured the rebuilt UI. `document.documentElement.scrollWidth` equalled `320`; every consequential checkbox/radio input measured `44x44` CSS pixels, including the Finance hard-constraint control. The compact disclosure remained keyboard/focus styled and no page-level horizontal overflow appeared.

## Verification

- `npx vitest run src/styles.test.ts src/core/finance-model.test.ts`: `2` files, `11` tests passed.
- Finance suite from the classifier increment: `src/core/finance.test.ts` `38/38` passed.
- `npm run typecheck`: passed.
- `npm run build`: passed; 71 modules; expected >500 kB JS warning.
- `npm run audit:static`: passed against the new digest/cache.

## Disposition

- `OMN-ACC-099`: bounded `PARTIAL`; current 320 CSS pixel / 200% row now includes 44 CSS pixel consequential targets, but other engines, assistive technology, profile variants, and human acceptance remain open.
- `OMN-ACC-133`: bounded `PARTIAL`; heterogeneous source classification, original-source preservation, and explicit exception routing were observed, but transaction-bearing mixed batches and full routine resolution remain open.
- `OMN-ACC-134`: bounded `PARTIAL`; renamed identical-byte reimport was idempotent, while ambiguous near-duplicate and legitimate repeated-transaction cases remain open.
- `OMN-ACC-169`: bounded `PARTIAL`; credit-card, investment, and insurance fact inputs were accepted with explicit limitations; full terms/performance qualification and downstream suitability boundaries remain open.

This receipt is target-qualified local evidence, not release, cross-browser, Vault, security, or human-acceptance evidence.
