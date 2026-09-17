# Phase 0 research receipt

Date: 2026-09-17
Status: INITIAL_SNAPSHOT; revalidate before adoption or release

## Workspace observation

- The workspace initially contained only `docs/Omni_3.32.0.md` and `docs/Omnevum-MPES-v0.12.0-converged.md`.
- No Git repository, source, manifest, tests, CI, or build artifacts were present.
- The two source documents were preserved unchanged for this increment.

## Governing sources directly inspected

- GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- WCAG 2.2 Recommendation: https://www.w3.org/TR/WCAG22/
- Indexed Database API: https://w3c.github.io/IndexedDB/
- Service Workers: https://w3c.github.io/ServiceWorker/
- Web Application Manifest: https://w3c.github.io/manifest/
- File System Standard: https://fs.spec.whatwg.org/
- Web Share API: https://www.w3.org/TR/web-share/

These sources inform qualification only. They do not replace the MPES or prove target support.

## Candidate source snapshots

- NeumanOS: https://github.com/travisjneuman/neumanos, HEAD `f4b2a174a339fc60524645a19417daedaf69ac91`, GitHub license MIT, TypeScript, package version 1.5.0. README and package metadata indicate a broad React/Dexie local PWA with tests and many productivity surfaces. Candidate only; module-specific state requires ownership analysis.
- Kurumi: https://github.com/raskell-io/kurumi, HEAD `5453bbb08630d5b36138f8d3dc186b81be1ca93e`, GitHub license MIT, Svelte, package version 0.0.1. README and package metadata indicate a local-first Svelte/Automerge PWA with Capture, search, AI, and sync surfaces. Candidate only; architecture and maturity require qualification.
- SelfStore: https://github.com/selfstoredev/selfstore, HEAD `0b56c7fdf74fe8e8d5ffeb9025f3e6893275338e`, GitHub license MIT, package version 1.8.22. README describes browser backup/restore, encrypted portable data, and user-controlled destinations. Candidate only; cryptography, conflicts, portability, and static-host fit require qualification.
- remoteStorage.js: https://github.com/remotestorage/remotestorage.js, HEAD `d899b5aee41849fc94c45470cfad08a7363780b6`, GitHub license MIT, package version 2.0.0-beta.10. Candidate only; browser auth, CORS, storage semantics, and maturity require qualification.

## Initial implementation decision

The Phase 0 shell uses Vite 8.3.0, TypeScript 7.0.2, Vitest 5.0.1, and native DOM/IndexedDB. This is a provisional low-dependency foundation, not a final framework decision. React/Svelte launchpad adoption remains open pending the recorded bake-off.

## Limits and next evidence

- Provider, browser, FOSS, and package facts are volatile and must be rechecked before release.
- No currentness register existed before this increment; `docs/control/upstream.json` is the initial snapshot.
- No target-device, accessibility-assistive-technology, security, migration, or production deployment evidence exists yet.

