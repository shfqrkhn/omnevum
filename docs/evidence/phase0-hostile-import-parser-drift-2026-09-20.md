# Phase 0 hostile-import and Finance parser-drift receipt

- Date: 2026-09-20 (America/Toronto)
- Authority: `docs/Omnevum-MPES-v0_18_0.md` SHA-256 `103d84308887da9f2eb73caf7eccabb0f68fd14e7c00f876911c9700c15096c8`
- Product source revision: `333a5d8` (`harden hostile imports and finance row drift`)
- Artifact digest: `6b21e1e771316236b2176d6c2e39ab661142743b873f9b467e05d0f55a32d923`
- Service-worker cache: `omnevum-shell-32eccddf2a11ae89`
- Target: local source/unit boundary; no user files, credentials, network destinations, or external effects

## Verified behavior

- `inspectArtifact` strips the body of an unclosed `<script>` or `<style>` container through the bounded input end. Hostile script text containing `fetch`, a remote URL, and DOM mutation did not enter derived text; the original source remains the preserved Artifact.
- Existing hostile CSV coverage continues to preserve formula-like values, markup, links, and macro-shaped content as inert source text with no execution path.
- Finance transaction and statement-facts CSV rows now fail closed when a non-empty field appears beyond the declared header. The row number is reported instead of silently dropping overflow data or parsing against a stale profile.

## Verification

- `npx vitest run src/core/artifact.test.ts src/core/acquire.test.ts src/core/document.test.ts src/core/finance.test.ts src/core/finance-model.test.ts`: 5 files, 43 tests passed.
- `npm run typecheck`: passed.
- `npm run build`: passed; 71 modules; expected >500 kB JavaScript warning.
- `git diff --check`: passed.

## Disposition

- `OMN-ACC-050`: bounded `PARTIAL`; inert hostile HTML and source-preserving Acquire/Artifact behavior are covered, while qualified PDF/OCR, heavy-work cancellation, and broader browser adapter rows remain open.
- `OMN-ACC-135`: bounded `PARTIAL`; row-level structural overflow is fail-closed, while validated account-profile lifecycle, sign-convention drift, re-detection, and routine no-review processing remain open.
- `OMN-ACC-147`: bounded `PARTIAL`; hostile HTML/CSV formula-like content and unclosed active containers are inert in the tested boundary, while real XLSX/PDF macro/formula/value/type/date round-trip qualification remains open.

This is source/unit evidence only. It is not deployment, browser-family, storage-fault, security-review, or human-acceptance evidence.
