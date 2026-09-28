// src/jev-proxy/__tests__/jev-resolver.test.js
const { test, expect } = require('@playwright/test');
const {
  buildResolverPrompt,
  parseResolverResponse,
  resolveWithJev,
} = require('../jev-resolver');

const CANDIDATES = [
  { ref: 'e2', role: 'link', name: 'Moje konto', label: 'A' },
  { ref: 'e3', role: 'button', name: 'Koszyk', label: 'B' },
  { ref: 'e7', role: 'link', name: 'Kontakt', label: 'C' },
  { ref: 'e10', role: 'button', name: 'Menu', label: 'D' },
];

test.describe('jev-resolver – buildResolverPrompt', () => {
  test('generates prompt with goal and labeled options', () => {
    const prompt = buildResolverPrompt('zaloguj użytkownika', CANDIDATES, 'homepage');
    expect(prompt).toContain('zaloguj użytkownika');
    expect(prompt).toContain('A:');
    expect(prompt).toContain('Moje konto');
    expect(prompt).toContain('B:');
    expect(prompt).toContain('Koszyk');
  });

  test('includes page context', () => {
    const prompt = buildResolverPrompt('zaloguj', CANDIDATES, 'formularz logowania');
    expect(prompt).toContain('formularz logowania');
  });
});

test.describe('jev-resolver – parseResolverResponse', () => {
  test('parses valid JEV choice response', () => {
    const jevData = {
      answers: {
        element_choice: { choice: 'A' },
        goal_state: { choice: 'navigate_toward_goal' },
      },
    };
    const result = parseResolverResponse(jevData, CANDIDATES);
    expect(result.ref).toBe('e2');
    expect(result.goalState).toBe('navigate_toward_goal');
  });

  test('maps confidence from noul probability', () => {
    const jevData = {
      answers: {
        element_choice: { choice: 'A' },
        goal_state: { choice: 'executable_here' },
        confidence: { noul: 0.91 },
      },
    };
    const result = parseResolverResponse(jevData, CANDIDATES);
    expect(result.confidence).toBeCloseTo(0.91, 1);
  });

  test('returns null ref for "none" choice', () => {
    const jevData = {
      answers: {
        element_choice: { choice: 'none' },
        goal_state: { choice: 'blocked' },
      },
    };
    const result = parseResolverResponse(jevData, CANDIDATES);
    expect(result.ref).toBeNull();
    expect(result.goalState).toBe('blocked');
  });

  test('handles missing answers gracefully', () => {
    const result = parseResolverResponse({}, CANDIDATES);
    expect(result.ref).toBeNull();
    expect(result.goalState).toBe('blocked');
    expect(result.confidence).toBeLessThan(0.5);
  });

  test('selects candidate with highest independent score_label (noul)', () => {
    const jevData = {
      answers: {
        goal_state: { choice: 'navigate_toward_goal' },
        element_choice: { choice: 'A' },
        score_A: { noul: 0.52 },
        score_B: { noul: 0.88 }, // Koszyk gets 88%
        score_C: { noul: 0.12 },
      },
    };
    const result = parseResolverResponse(jevData, CANDIDATES);
    expect(result.ref).toBe('e3'); // candidate B (Koszyk)
    expect(result.choiceLabel).toBe('B');
    expect(result.confidence).toBeCloseTo(0.88, 2);
    expect(result.scores).toEqual({ A: 0.52, B: 0.88, C: 0.12 });
  });
});

