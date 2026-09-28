// src/jev-proxy/__tests__/types.test.js
const { test, expect } = require('@playwright/test');
const { validateAction, validateGoal, VALID_ACTION_TYPES, VALID_GOAL_STATES } = require('../types');

test.describe('types – validateAction', () => {
  test('accepts valid click action', () => {
    expect(validateAction({ type: 'click', target: 'przycisk Zaloguj' })).toEqual({ valid: true });
  });

  test('accepts valid fill action', () => {
    expect(validateAction({ type: 'fill', target: 'pole email', value: 'test@test.com' })).toEqual({ valid: true });
  });

  test('accepts valid navigate action', () => {
    expect(validateAction({ type: 'navigate', url: 'https://example.com' })).toEqual({ valid: true });
  });

  test('accepts valid read action', () => {
    expect(validateAction({ type: 'read', target: 'tytuł strony' })).toEqual({ valid: true });
  });

  test('rejects unknown type', () => {
    const result = validateAction({ type: 'hover', target: 'foo' });
    expect(result.valid).toBe(false);
  });

  test('rejects fill without value', () => {
    const result = validateAction({ type: 'fill', target: 'pole' });
    expect(result.valid).toBe(false);
  });

  test('rejects navigate without url', () => {
    const result = validateAction({ type: 'navigate' });
    expect(result.valid).toBe(false);
  });

  test('rejects click without target', () => {
    const result = validateAction({ type: 'click' });
    expect(result.valid).toBe(false);
  });

  test('rejects null', () => {
    expect(validateAction(null).valid).toBe(false);
  });
});

test.describe('types – validateGoal', () => {
  test('accepts valid goal', () => {
    expect(validateGoal({ goal: 'zaloguj użytkownika' })).toEqual({ valid: true });
  });

  test('rejects empty goal', () => {
    expect(validateGoal({ goal: '' }).valid).toBe(false);
  });

  test('rejects missing goal field', () => {
    expect(validateGoal({ intent: 'foo' }).valid).toBe(false);
  });
});
