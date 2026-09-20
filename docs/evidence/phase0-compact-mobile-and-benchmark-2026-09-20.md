# v0.18.0 compact mobile and benchmark increment

- Date: 2026-09-20
- Baseline: `docs/Omnevum-MPES-v0_18_0.md` SHA-256 `103d84308887da9f2eb73caf7eccabb0f68fd14e7c00f876911c9700c15096c8`
- Source revision: `0c83e8d7050dce0276eab01b9c7609387f3fc57e`
- Target: local production preview `http://127.0.0.1:4176/`, Chrome DevTools, emulated mobile `390x844`, DPR 2, touch

## Compact/mobile fix

The default shell keeps frequent Capture visible and moves lower-frequency Search, Assistant, Triage, Records, and Recovery behind disclosure summaries. Recovery backup controls now have a valid non-submitting form and explicit field metadata. The unsupported `frame-ancestors` meta directive and missing favicon request were removed. Local navigation Lighthouse reported Accessibility 100, Best Practices 100, SEO 100, and Agentic Browsing 100; all 53 audits passed. The console contained no messages after a cache-bypassing reload.

## New bounded benchmark evidence

| Command | Result | Scope |
| --- | --- | --- |
| `npm run benchmark:finance-phase4` | PASS | Synthetic current-source contract coverage for `OMN-ACC-159..171`; 5 shared goals, authorized Travel/Work projections, 2 FIRE scenarios, bounded cycle/feedback behavior, 1 transfer match, 3 forecast points, 6 review cases, 0 observable missed known issues |
| `npm run benchmark:fresh-package-handoff` | PASS | Synthetic fresh-process handoff contract; 17 checks, 1 restored workflow, 1 skipped-without-package workflow, no chat history/network/credentials |

Finance source hash: `db4f790252911ee1930ac4697f83a22c2e65da2d51f08bb7fa42b8fe6647986c`, calculated over the sorted current Finance/dependency source paths declared by the benchmark.

## Artifact and boundaries

The local build produced artifact digest `8cea52243b018b1c6afeba14ff2ad431658b17bcd8f26f3a1c376e3832465d96` with service-worker cache `omnevum-shell-db998bd1a51f7215` and ten files, including `robots.txt` and `llms.txt`. This is a candidate identity only until the release register is updated and the exact artifact is deployed and byte-probed on GitHub Pages.

This receipt is `PARTIAL` evidence only. The benchmarks are synthetic source-contract checks; they do not prove browser-family coverage, assistive technology, human acceptance, clean-machine artifact restoration, real statements, suitability, release readiness, or any financial decision.
