// src/jev-proxy/e2e-test.js
'use strict';

const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');

async function runE2E() {
  const cliPath = path.resolve(__dirname, 'cli.js');

  console.log('🚀 Starting BIL E2E test...');
  console.log('   This will launch a headed browser and test browser_goal\n');

  const server = spawn(process.execPath, [cliPath, '--headed'], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  const rl = readline.createInterface({
    input: server.stdout,
    terminal: false,
    crlfDelay: Infinity,
  });

  let messageId = 0;
  const pending = new Map();

  function call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++messageId;
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timeout waiting for response to ${method}`));
      }, 60000);
      pending.set(id, { resolve, reject, timeout });
      const msg = { jsonrpc: '2.0', id, method, params };
      server.stdin.write(JSON.stringify(msg) + '\n');
    });
  }

  function notify(method, params = {}) {
    const msg = { jsonrpc: '2.0', method, params };
    server.stdin.write(JSON.stringify(msg) + '\n');
  }

  rl.on('line', (line) => {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject, timeout } = pending.get(msg.id);
      clearTimeout(timeout);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  });

  try {
    // 1. Handshake
    console.log('🤝 MCP initialize...');
    await call('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'bil-e2e-test', version: '1.0.0' },
    });
    notify('notifications/initialized');
    console.log('✅ Connected\n');

    // 2. Tools list — verify browser_goal exists
    const toolsResult = await call('tools/list');
    const tools = toolsResult.tools || [];
    const hasGoal = tools.some(t => t.name === 'browser_goal');
    console.log(`✅ Tools: ${tools.length} (browser_goal: ${hasGoal ? 'YES' : 'NO'})\n`);

    // 3. Navigate to a test page
    const testUrl = process.argv[2] || 'https://practicetestautomation.com/practice-test-login/';
    console.log(`🌐 Navigating to: ${testUrl}`);
    await call('tools/call', { name: 'browser_navigate', arguments: { url: testUrl } });
    console.log('✅ Page loaded\n');

    // 4. Call browser_goal
    console.log('🎯 Calling browser_goal({ goal: "zaloguj użytkownika" })...');
    const goalResult = await call('tools/call', {
      name: 'browser_goal',
      arguments: { goal: 'zaloguj użytkownika' },
    });
    console.log('\n' + (goalResult?.content?.[0]?.text || JSON.stringify(goalResult)));

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    console.log('\n👋 Shutting down...');
    server.kill();
    process.exit(0);
  }
}

if (require.main === module) {
  runE2E().catch(console.error);
}
