# Phase 0 production-preview receipt

Date: 2026-09-17  
Status: PARTIAL; local Vite preview only, not a deployed static-host or cross-browser claim

## Environment

- Artifact: current `npm run build` output served by `npm run preview -- --host 127.0.0.1 --port 4173`
- Browser surface: Codex In-app Browser
- Test data: synthetic observation `static preview smoke`

## Observed

- The production-built shell loaded at `/` with the same labelled sections and controls as the development smoke.
- An observation was created and displayed with owner `core.capture`, revision `1`.
- Reload preserved the observation in the production preview origin.
- No warning or error entries were returned by the browser console inspection.

## Limits

This receipt does not establish GitHub Pages routing, service-worker activation/offline behavior, browser-family support, responsive/accessibility conformance, or release readiness. Those remain open in the support, risk, and completion registers.
