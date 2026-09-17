# Omnevum

Omnevum is a mobile-first, local-first personal Life OS and extensible app/game platform.

This checkout is the initial Phase 0 implementation foundation. The governing design baseline is [Omni](docs/Omni_3.32.0.md) and the product specification is the [Omnevum MPES](docs/Omnevum-MPES-v0.12.0-converged.md).

## Current implementation

- Vite and TypeScript static PWA shell.
- Native DOM presentation with accessible Light and AMOLED Dark themes.
- IndexedDB canonical record store with revision and tombstone semantics.
- One command path for initial Capture records.
- Portable unencrypted Vault export/import with validation.
- One platform service worker for same-origin shell caching.
- Vitest coverage for canonical persistence, import precedence, provenance, and owner admission.

The stack and storage choices remain provisional until the Phase 0 characterization records close. AI, sync, connectors, and executable extensions are not active in this foundation.

## Development

```text
npm install
npm run ci
npm run dev
```

Control projections live under `docs/control/`; research and receipts live under `docs/evidence/`. Generated control files identify their generator and source hashes.

