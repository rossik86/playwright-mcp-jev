// src/jev-proxy/__tests__/playwright-executor.test.js
const { test, expect } = require('@playwright/test');
const { PlaywrightExecutor } = require('../playwright-executor');

// Mock RPC caller
function createMockRpc(responses = {}) {
  const calls = [];
  return {
    calls,
    call: async (method, params) => {
      calls.push({ method, params });
      const key = params?.name || method;
      if (responses[key] instanceof Error) throw responses[key];
      return responses[key] || { content: [{ type: 'text', text: 'ok' }] };
    },
  };
}

test.describe('PlaywrightExecutor', () => {
  test('executeClick sends browser_click with ref', async () => {
    const rpc = createMockRpc();
    const executor = new PlaywrightExecutor(rpc.call);

    await executor.executeClick('e42');

    expect(rpc.calls).toHaveLength(1);
    expect(rpc.calls[0].params.name).toBe('browser_click');
    expect(rpc.calls[0].params.arguments.ref).toBe('e42');
  });

  test('executeFill sends browser_fill_form with ref and value', async () => {
    const rpc = createMockRpc();
    const executor = new PlaywrightExecutor(rpc.call);

    await executor.executeFill('e10', 'test@example.com');

    expect(rpc.calls).toHaveLength(1);
    expect(rpc.calls[0].params.name).toBe('browser_fill_form');
    expect(rpc.calls[0].params.arguments.ref).toBe('e10');
    expect(rpc.calls[0].params.arguments.value).toBe('test@example.com');
  });

  test('executeNavigate sends browser_navigate with url', async () => {
    const rpc = createMockRpc();
    const executor = new PlaywrightExecutor(rpc.call);

    await executor.executeNavigate('https://example.com/login');

    expect(rpc.calls).toHaveLength(1);
    expect(rpc.calls[0].params.name).toBe('browser_navigate');
    expect(rpc.calls[0].params.arguments.url).toBe('https://example.com/login');
  });

  test('executeRead sends browser_snapshot and extracts text', async () => {
    const rpc = createMockRpc({
      browser_snapshot: { content: [{ type: 'text', text: 'Page Title: Hello World' }] },
    });
    const executor = new PlaywrightExecutor(rpc.call);

    const text = await executor.executeRead();
    expect(text).toContain('Hello World');
  });

  test('returns ActionFeedback on success', async () => {
    const rpc = createMockRpc();
    const executor = new PlaywrightExecutor(rpc.call);

    const feedback = await executor.executeClick('e1');
    expect(feedback.status).toBe('success');
  });

  test('returns error feedback on failure', async () => {
    const rpc = createMockRpc({
      browser_click: new Error('Element not found'),
    });
    const executor = new PlaywrightExecutor(rpc.call);

    const feedback = await executor.executeClick('e999');
    expect(feedback.status).toBe('error');
    expect(feedback.error).toContain('Element not found');
  });
});
