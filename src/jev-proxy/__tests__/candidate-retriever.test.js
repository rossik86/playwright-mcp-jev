// src/jev-proxy/__tests__/candidate-retriever.test.js
const { test, expect } = require('@playwright/test');
const { retrieveCandidates } = require('../candidate-retriever');

const ELEMENTS = [
  { ref: 'e1', role: 'link', name: 'Home', href: '/' },
  { ref: 'e2', role: 'link', name: 'Moje konto', href: '/account' },
  { ref: 'e3', role: 'button', name: 'Koszyk' },
  { ref: 'e4', role: 'textbox', name: 'Email' },
  { ref: 'e5', role: 'textbox', name: 'Hasło' },
  { ref: 'e6', role: 'button', name: 'Zaloguj się' },
  { ref: 'e7', role: 'link', name: 'Kontakt', href: '/contact' },
  { ref: 'e8', role: 'link', name: 'Regulamin', href: '/terms' },
  { ref: 'e9', role: 'button', name: 'Akceptuj cookies' },
  { ref: 'e10', role: 'button', name: 'Menu', parent: 'navigation' },
];

test.describe('candidate-retriever', () => {
  test('returns max candidates within limit', () => {
    const candidates = retrieveCandidates(ELEMENTS, { goal: 'zaloguj', type: 'click' }, { maxCandidates: 5 });
    expect(candidates.length).toBeLessThanOrEqual(5);
    expect(candidates.length).toBeGreaterThan(0);
  });

  test('ranks "Zaloguj się" button high for goal "zaloguj"', () => {
    const candidates = retrieveCandidates(ELEMENTS, { goal: 'zaloguj użytkownika', type: 'click' });
    const topRefs = candidates.slice(0, 3).map(c => c.ref);
    expect(topRefs).toContain('e6');
  });

  test('ranks "Moje konto" link for goal "zaloguj" (navigate path)', () => {
    const candidates = retrieveCandidates(ELEMENTS, { goal: 'zaloguj użytkownika' });
    const topRefs = candidates.slice(0, 5).map(c => c.ref);
    expect(topRefs).toContain('e2');
  });

  test('ranks textboxes high for fill action', () => {
    const candidates = retrieveCandidates(ELEMENTS, { goal: 'wypełnij email', type: 'fill' });
    const topRefs = candidates.slice(0, 3).map(c => c.ref);
    expect(topRefs).toContain('e4');
  });

  test('filters by role for click — no textboxes', () => {
    const candidates = retrieveCandidates(ELEMENTS, { goal: 'kliknij', type: 'click' });
    const roles = candidates.map(c => c.role);
    expect(roles).not.toContain('textbox');
  });

  test('includes href-matching for navigation goals', () => {
    const candidates = retrieveCandidates(ELEMENTS, { goal: 'przejdź do kontaktu' });
    const topRefs = candidates.slice(0, 3).map(c => c.ref);
    expect(topRefs).toContain('e7');
  });

  test('returns empty array for empty input', () => {
    expect(retrieveCandidates([], { goal: 'foo' })).toEqual([]);
  });

  test('each candidate has score', () => {
    const candidates = retrieveCandidates(ELEMENTS, { goal: 'zaloguj' });
    for (const c of candidates) {
      expect(typeof c.score).toBe('number');
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(1);
    }
  });
});
