# v0.18.0 compact responsive accessibility-profile receipt

- Date: 2026-09-19 (America/Toronto)
- Authority: `docs/Omnevum-MPES-v0_18_0.md` SHA-256 `103d84308887da9f2eb73caf7eccabb0f68fd14e7c00f876911c9700c15096c8`
- Source revision: `bba8c9ccb76a572e3c424385248516f87bcad700`
- Target: local Vite production preview `http://127.0.0.1:4173/` in the Codex in-app Chromium browser
- Profile: temporary CDP viewport `320x844`, device scale factor 1, visible Presentation form text scale `200%`; the override and test setting were reset to the default `100%` and compact density after verification

## Observed rows

| surface | `clientWidth` | `scrollWidth` | `body.scrollWidth` | result |
| --- | ---: | ---: | ---: | --- |
| Home + Capture | 320 | 320 | 320 | no horizontal overflow |
| active Direction lens | 320 | 320 | 320 | no horizontal overflow |
| Search / Exploration | 320 | 320 | 320 | no horizontal overflow |
| Assistant | 320 | 320 | 320 | no horizontal overflow |
| System / Recovery | 320 | 320 | 320 | no horizontal overflow |

The active lens and each disclosure were opened through their keyboard-accessible summary controls. The layout retained compact disclosures and did not propagate horizontal scrolling to the page. The visible Presentation profile accepted the 200% selection, and the saved profile was returned to 100% with compact density afterward.

## Source identities

| path | SHA-256 |
| --- | --- |
| `src/styles.css` | `491bb779d1e86e043b6e35d222b0e6f8a3e3ff1d877de1e8f0793718ef085ce0` |
| `src/ui/app.ts` | `5f117f3072b5a2414b6992453275d5552c95b4ea3d5a950288cf7678828b584e` |
| `src/core/presentation.ts` | `8b7b2b22fa729277e6e64346e67836f75064d3b0f7f3ff496901074d044398bd` |

## Disposition

This is `PARTIAL` evidence for `OMN-ACC-099`. It proves a current Chromium responsive row at 320 CSS pixels and 200% text scale for the named surfaces, but does not prove Safari/WebKit, Firefox, native touch hardware, assistive technology, every admitted density/family/state, automated WCAG conformance, or human acceptance. No accessibility or release gate is promoted.
