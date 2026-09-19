# Omnevum engineering

## Authority and scope

- `docs/Omni_3.32.0.md` is the governing doctrine.
- `docs/Omnevum-MPES-v0_17_4.md` is the controlling product and engineering baseline; the superseded v0.12 source is historical and may only be referenced through an explicit relocation/compatibility receipt.
- `docs/control/` contains generated projections and maintained registers; `docs/evidence/` contains dated receipts.
- A design, test, or generated status is not implementation, security, release, or human-acceptance evidence until its receipt says what ran, where, when, and with which artifact.

## Working rules

- Preserve source documents, user data, provenance, history, secrets/configuration, and parked specifications.
- Keep one canonical owner for each mutable fact and route mutations through the command layer.
- Keep AI, sync, connectors, and executable extensions optional and truthfully degraded until their gates close.
- Use `apply_patch` for source edits. Do not weaken tests or gates to obtain a pass.

## Required verification

Run `npm run ci` before handoff. It regenerates and checks control projections, verifies structure and references, checks canonical-owner architecture, typechecks, runs tests, builds the relative static PWA, audits the bundle, checks generated drift, and runs `git diff --check`.
