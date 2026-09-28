// src/jev-proxy/__tests__/normalizer.test.js
const { test, expect } = require('@playwright/test');
const { normalizeSnapshot } = require('../normalizer');

const SAMPLE_SNAPSHOT = `- document [ref=d1] "Example Page"
  - banner [ref=b1]
    - navigation [ref=n1] "Main Nav"
      - link [ref=e1] "Home" [url="/"]
      - link [ref=e2] "Moje konto" [url="/account"]
      - button [ref=e3] "Koszyk"
      - generic [ref=g1]
        - generic [ref=g2]
  - main [ref=m1]
    - heading [ref=h1] "Witamy"
    - generic [ref=g3]
    - textbox [ref=e4] "Email"
    - textbox [ref=e5] "Hasło"
    - button [ref=e6] "Zaloguj się"
    - paragraph [ref=p1] "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur."
  - contentinfo [ref=f1]
    - link [ref=e7] "Kontakt" [url="/contact"]
    - link [ref=e8] "Regulamin" [url="/terms"]`;

test.describe('normalizer – normalizeSnapshot', () => {
  test('returns NormalizedElement[] with correct structure', () => {
    const elements = normalizeSnapshot(SAMPLE_SNAPSHOT);
    expect(Array.isArray(elements)).toBe(true);
    expect(elements.length).toBeGreaterThan(0);

    for (const el of elements) {
      expect(el).toHaveProperty('ref');
      expect(el).toHaveProperty('role');
      expect(el).toHaveProperty('name');
    }
  });

  test('includes all interactive elements', () => {
    const elements = normalizeSnapshot(SAMPLE_SNAPSHOT);
    const refs = elements.map(e => e.ref);
    // Musi zawierać linki, buttony, textboxy
    expect(refs).toContain('e1');
    expect(refs).toContain('e2');
    expect(refs).toContain('e3');
    expect(refs).toContain('e4');
    expect(refs).toContain('e5');
    expect(refs).toContain('e6');
    expect(refs).toContain('e7');
    expect(refs).toContain('e8');
  });

  test('excludes empty generic containers', () => {
    const elements = normalizeSnapshot(SAMPLE_SNAPSHOT);
    const refs = elements.map(e => e.ref);
    // generic bez treści/dzieci interaktywnych powinny zniknąć
    expect(refs).not.toContain('g1');
    expect(refs).not.toContain('g2');
    expect(refs).not.toContain('g3');
  });

  test('extracts href for links', () => {
    const elements = normalizeSnapshot(SAMPLE_SNAPSHOT);
    const homeLink = elements.find(e => e.ref === 'e1');
    expect(homeLink).toBeDefined();
    expect(homeLink.href).toBe('/');
  });

  test('extracts parent info', () => {
    const elements = normalizeSnapshot(SAMPLE_SNAPSHOT);
    const accountLink = elements.find(e => e.ref === 'e2');
    expect(accountLink).toBeDefined();
    expect(accountLink.parent).toContain('navigation');
  });

  test('truncates long text', () => {
    const elements = normalizeSnapshot(SAMPLE_SNAPSHOT);
    // paragraph z Lorem ipsum nie powinien mieć pełnego tekstu
    for (const el of elements) {
      if (el.name) {
        expect(el.name.length).toBeLessThanOrEqual(100);
      }
    }
  });

  test('deduplicates elements with same role+name', () => {
    const dupeSnapshot = `- document [ref=d1]
  - link [ref=a1] "Login"
  - link [ref=a2] "Login"
  - link [ref=a3] "Login"
  - button [ref=b1] "Submit"`;

    const elements = normalizeSnapshot(dupeSnapshot);
    const loginLinks = elements.filter(e => e.role === 'link' && e.name === 'Login');
    // Powinno zachować max 2 (oryginał + 1 duplikat z innym ref)
    expect(loginLinks.length).toBeLessThanOrEqual(2);
  });

  test('handles empty input', () => {
    expect(normalizeSnapshot('')).toEqual([]);
    expect(normalizeSnapshot(null)).toEqual([]);
  });
});
