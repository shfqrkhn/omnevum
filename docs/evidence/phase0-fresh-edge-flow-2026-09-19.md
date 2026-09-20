# v0.18.0 fresh-profile Edge flow receipt

- Date: 2026-09-19 (America/Toronto)
- Source revision: `d6fbe276dc5f89e000ca350506053ae22b054cdd`
- Target: [https://shfqrkhn.github.io/omnevum/](https://shfqrkhn.github.io/omnevum/)
- Browser: isolated fresh Microsoft Edge QA profile, Codex tab `1690081702`, viewport `2552x1274` (`clientWidth=2537`)

## Flow

- Fresh state showed no records and no account/backend requirement; the getting-started guide was opened and dismissed.
- Capture created `Fresh Edge acceptance probe` as one canonical Note and one inbox item.
- Triage marked the item reviewed; the inbox cleared while the canonical record remained at revision 2.
- Search for `Fresh Edge acceptance` rebuilt the derived index and returned `1 result(s); derived index healthy.`
- Recovery exported a full Vault containing `1 record(s), 0 artifact payload(s), 2718 bytes.`
- Reload retained the record (`summary-total=1`, `record-count=1`, probe text present) with compact density still selected.
- The fresh document had no horizontal overflow (`scrollWidth=2537`, `clientWidth=2537`).
- The same isolated profile was measured at an emulated `390x844` mobile viewport: compact density remained selected, only primary navigation and records were open by default, and `scrollWidth=390`, `clientWidth=390` (`scrollHeight=3827`).

## Boundary

This is fresh-profile Chromium-family evidence for OMN-ACC-001 only at `PARTIAL`. Emulation is not native mobile hardware/browser proof; Safari/WebKit, Firefox, assistive technology, rollback, update interruption, quota/corruption injection, cross-origin restoration, and human acceptance remain open.
