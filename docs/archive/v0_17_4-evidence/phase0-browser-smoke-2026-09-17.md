# Phase 0 browser smoke receipt

Date: 2026-09-17  
Status: PARTIAL; local development-host smoke only, not a release or cross-browser claim

## Environment

- URL: `http://127.0.0.1:5173/`
- Host: Vite development server from the repository workspace
- Browser surface: Codex In-app Browser
- Test data: a synthetic task, `Review the Phase 0 evidence`; no user personal data

## Observed pass cases

1. The shell loaded with an accessibility tree containing labelled landmark sections, headings, form labels, a status region, and keyboard-addressable controls.
2. The presentation form changed the display name to `JohnOS`; the app reported that canonical identities were unchanged.
3. A `task` capture was created through the shared Capture form and appeared with owner `core.capture`, revision `1`, and a Complete action.
4. Search for `Phase 0` returned exactly one result and reported a healthy derived index.
5. The theme control changed from AMOLED dark to Light theme and exposed the changed pressed state.
6. Reload preserved the `JohnOS` presentation name, theme state, and canonical task.

## Not established by this receipt

- production build served from a static HTTPS host;
- service-worker activation, offline navigation, update, and rollback;
- mobile viewport, touch, keyboard-only, screen-reader, or WCAG conformance;
- quota, corruption, interrupted migration, Vault download/upload, or cross-origin restore;
- browser-family support rows, security boundary tests, or human acceptance.

The observations support the initial vertical shell only. Open items remain release-visible in the control registers.
