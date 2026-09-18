# Phase 0 dependency and supply-chain inventory receipt

Date: 2026-09-17  
Status: INITIAL_PASS_WITH_REVIEW_OPEN; package metadata and advisory scan are not legal or release assurance

## Observed

- Node: `v24.19.0`; npm: `11.17.0`.
- `npm install` completed from the declared manifest and produced the committed `package-lock.json`.
- `npm audit --audit-level=high` reported `found 0 vulnerabilities` for the current installed graph.
- `npm run audit:security` now runs the same high-severity advisory gate in the normal CI sequence; the current run reports `found 0 vulnerabilities`.
- The generated dependency inventory contains the exact lockfile source hash and package integrity/resolution metadata for the installed graph.
- Package-lock license metadata is recorded where present; the license/provenance register remains open for exact notice, source-obligation, distribution-profile, and currentness review.

## Automated metadata gate

The repository now runs `npm run audit:licenses` in the normal CI gate. It checks every `node_modules` entry in `package-lock.json` for a non-empty exact version, resolved source, integrity value, and license metadata. The current run passes all `87` locked packages with the following metadata counts: `Apache-2.0:24`, `BSD-3-Clause:1`, `ISC:2`, `MIT:48`, `MPL-2.0:12`; lock SHA-256 is `2209213b8c2ac98ae99979dfdd4fc1837124b88543fcac2dfc8f3dcde81212af`.

This is an automated metadata/provenance guard, not legal advice or proof of notice, corresponding-source, rights, security, or currentness compliance. Those release blockers remain open in `docs/control/license-provenance.json`.

## Limits

The result is a point-in-time local scan. It does not establish absence of undisclosed vulnerabilities, legal compatibility, upstream availability, workflow supply-chain safety, reproducible builds, signing/attestation, or release readiness. Those gates remain explicit in `docs/control/release-evidence.json` and `docs/control/license-provenance.json`.
