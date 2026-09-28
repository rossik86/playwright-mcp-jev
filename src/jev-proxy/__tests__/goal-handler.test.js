// src/jev-proxy/__tests__/goal-handler.test.js
const { test, expect } = require('@playwright/test');
const { GoalHandler, BROWSER_GOAL_TOOL } = require('../goal-handler');

test.describe('GoalHandler', () => {
  test('BROWSER_GOAL_TOOL has correct schema', () => {
    expect(BROWSER_GOAL_TOOL.name).toBe('browser_goal');
    expect(BROWSER_GOAL_TOOL.inputSchema.required).toContain('goal');
  });

  test('rejects invalid goal', async () => {
    const handler = new GoalHandler({
      rpcCall: async () => ({}),
      jevConfig: { model: 'test', apiKey: '', baseUrl: '' },
    });

    const result = await handler.handle({ goal: '' });
    expect(result.isError).toBe(true);
  });

  test('formatResult includes goal and state', () => {
    const handler = new GoalHandler({
      rpcCall: async () => ({}),
      jevConfig: { model: 'test', apiKey: '', baseUrl: '' },
    });

    const text = handler.formatResult(
      { finalState: 'completed', steps: 3, escalated: false, stopped: false, log: [] },
      'zaloguj'
    );
    expect(text).toContain('zaloguj');
    expect(text).toContain('completed');
    expect(text).toContain('3');
  });
});
