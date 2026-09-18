# Omnevum

Omnevum is a mobile-first, local-first personal Life OS and extensible app/game platform.

This checkout is the initial Phase 0 implementation foundation. The governing design baseline is [Omni](docs/Omni_3.32.0.md) and the product specification is the [Omnevum MPES](docs/Omnevum-MPES-v0.12.0-converged.md).

## Current implementation

- Vite and TypeScript static PWA shell.
- Native DOM presentation with accessible Light and AMOLED Dark themes.
- IndexedDB canonical record store with revision and tombstone semantics.
- One command path for Capture, triage, update, archive, Undo, relationship, focus-Time, and bounded Artifact records.
- Acquire/Ingest stages bounded text, JSON, CSV, URL, file, and clipboard input for review before canonical acceptance.
- Search over a rebuildable derived index with health reporting.
- Portable unencrypted Vault export/import with revision-aware validation and Artifact payloads.
- Platform-owned Effect/Outbox state with secret-field rejection, ready for optional external adapters.
- One platform service worker for same-origin shell caching.
- Vitest coverage for canonical persistence, import precedence, provenance, and owner admission.

The stack and storage choices remain provisional until the Phase 0 characterization records close. AI, sync, connectors, and executable extensions are not active in this foundation. The current MVP nucleus is evidence-backed only by local browser smoke; it is not a release claim.

## Development

```text
npm install
npm run ci
npm run dev
```

Control projections live under `docs/control/`; research and receipts live under `docs/evidence/`. Generated control files identify their generator and source hashes. The normal CI gate runs structure, reference, architecture, strict type, unit, build, static-host, generated-drift, and whitespace checks.

The `.github/workflows/pages.yml` workflow is the static deployment path: it runs the same locked CI/build gate, uploads only the top-level `dist/` artifact, and deploys through the GitHub Pages environment. A live URL, deployment smoke, rollback, and target support receipt remain release evidence rather than being inferred from the workflow file.
