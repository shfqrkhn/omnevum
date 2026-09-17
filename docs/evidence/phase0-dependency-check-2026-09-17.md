# Phase 0 dependency and supply-chain inventory receipt

Date: 2026-09-17  
Status: INITIAL_PASS_WITH_REVIEW_OPEN; package metadata and advisory scan are not legal or release assurance

## Observed

- Node: `v24.19.0`; npm: `11.17.0`.
- `npm install` completed from the declared manifest and produced the committed `package-lock.json`.
- `npm audit --audit-level=high` reported `found 0 vulnerabilities` for the current installed graph.
- The generated dependency inventory contains the exact lockfile source hash and package integrity/resolution metadata for the installed graph.
- Package-lock license metadata is recorded where present; the license/provenance register remains open for exact notice, source-obligation, distribution-profile, and currentness review.

## Limits

The result is a point-in-time local scan. It does not establish absence of undisclosed vulnerabilities, legal compatibility, upstream availability, workflow supply-chain safety, reproducible builds, signing/attestation, or release readiness. Those gates remain explicit in `docs/control/release-evidence.json` and `docs/control/license-provenance.json`.
