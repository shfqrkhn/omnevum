# Omnevum documentation

Authority order for this project is external authority and owner direction, then the MPES, then derived requirements, decisions, implementation, and evidence.

- `Omni_3.32.0.md` is the governing Omni doctrine.
- `Omnevum-MPES-v0_18_0.md` is the controlling product and engineering baseline. The superseded v0.17.4 and v0.12 sources are historical and are represented by generated relocation/compatibility receipts.
- `control/` contains machine-readable generated projections and active registers.
- `evidence/` contains dated research and verification receipts.
- `control/recovery-bundle.json` is a generated, integrity-checked resume manifest; it contains repository-relative references and hashes, never secrets or live credentials.

The MPES is a design baseline, not proof of implementation or release. Generated projections never replace the canonical MPES.

To resume from a clean checkout, read the two authority documents and the controller/ledger registers, then run `npm ci`, `npm run audit:recovery`, and `npm run ci`. The recovery audit verifies the current source revision and every manifest hash before work continues.
