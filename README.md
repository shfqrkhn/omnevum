# Omnevum

Omnevum is a mobile-first, local-first personal Life OS and extensible app/game platform.

This checkout is the v0.18.0 overhaul foundation. [Omni](docs/Omni_3.32.0.md) governs the engineering doctrine and [MPES v0.18.0](docs/Omnevum-MPES-v0_18_0.md) is the sole active product baseline. The implementation is requalified from a clean v0.18 baseline; no prior capability or release claim is inherited.

## Current implementation

- Vite and TypeScript static PWA shell.
- Native DOM presentation with accessible Light and AMOLED Dark themes.
- IndexedDB canonical record store with revision and tombstone semantics.
- One command path for Capture, triage, update, archive, Undo, relationship, focus-Time, and bounded Artifact records.
- Acquire/Ingest stages bounded text, JSON, CSV, URL, file, and clipboard input for review before canonical acceptance.
- Search over a rebuildable derived index with health reporting.
- Portable unencrypted Vault export/import with revision-aware validation and Artifact payloads.
- Source / meaning workbench for source-linked Evidence, quote-validated Annotation, and GeoJSON Point Place records.
- Purpose-bound sharing grants with explicit private disclosure, declared-Space enforcement, revocation, and bounded projections.
- Platform-owned Effect/Outbox state with secret-field rejection, ready for optional external adapters.
- One platform service worker for same-origin shell caching.
- Vitest coverage for canonical persistence, import precedence, provenance, and owner admission.

The stack and storage choices remain provisional until the Phase 0 characterization records close. AI, provider-backed sync, connectors, and executable extensions are not active in this foundation; manual Vault portability and provider-neutral sync contracts remain available behind explicit seams. The current MVP nucleus is evidence-backed only by local browser smoke; it is not a release claim.

## Development

```text
npm install
npm run ci
npm run dev
```

Control projections live under `docs/control/`; research and receipts live under `docs/evidence/`. Generated control files identify their generator and source hashes. The normal CI gate runs structure, reference, architecture, strict type, unit, build, static-host, generated-drift, and whitespace checks.

The `.github/workflows/pages.yml` workflow is the static deployment path: it runs the same locked CI/build gate, uploads only the top-level `dist/` artifact, and deploys through the GitHub Pages environment. A live URL, deployment smoke, rollback, and target support receipt remain release evidence rather than being inferred from the workflow file.
