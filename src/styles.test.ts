import { readFileSync } from "node:fs";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("compact accessibility target styles", () => {
  it("keeps native checkbox and radio hit boxes at the WCAG touch minimum without enlarging their visible glyph", () => {
    expect(styles).toMatch(/--omn-touch-target:\s*44px;/u);
    expect(styles).toMatch(/\.check-row\s*\{[^}]*min-height:\s*var\(--omn-touch-target\);[^}]*padding-inline-start:/su);
    expect(styles).toMatch(/\.check-row input\[type="checkbox"\], \.check-row input\[type="radio"\]\s*\{[^}]*width:\s*var\(--omn-touch-target\);[^}]*height:\s*var\(--omn-touch-target\);[^}]*appearance:\s*none;/su);
    expect(styles).toMatch(/\.check-row::before\s*\{[^}]*width:\s*1\.15rem;[^}]*height:\s*1\.15rem;/su);
  });

  it("keeps every disclosure summary at least 44 CSS px tall and preserves visible focus", () => {
    expect(styles).toMatch(/details > summary\s*\{[^}]*min-height:\s*var\(--omn-touch-target\);/su);
    expect(styles).toMatch(/\.check-row:has\(input:focus-visible\)\s*\{[^}]*outline:\s*3px solid var\(--focus\);/su);
  });

  it("uses progressive disclosure and compact primary-capture grouping", () => {
    expect(styles).toMatch(/\.home-widget-disclosure\s*\{[^}]*display:\s*grid;/su);
    expect(styles).toMatch(/#capture-form\s*\{[^}]*display:\s*grid;[^}]*gap:\s*0\.45rem;/su);
    expect(styles).toMatch(/\.capture-choice-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/su);
    expect(styles).toMatch(/\.domain-disclosure\s*\{[^}]*border:\s*1px solid var\(--line\);/su);
    expect(styles).toMatch(/\.domain-disclosure > \.domain-form\s*\{[^}]*padding:\s*0\.4rem 0 0;/su);
    expect(styles).toMatch(/\[data-density="compact"\] \.primary-nav-menu:not\(\[open\]\) > ol\s*\{[^}]*display:\s*none;/su);
    expect(styles).toMatch(/\[data-density="compact"\] \.compact-panel > \.compact-summary\.section-heading\s*\{[^}]*flex-direction:\s*row;[^}]*align-items:\s*center;/su);
  });
});
