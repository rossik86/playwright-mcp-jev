// src/jev-proxy/benchmark/runner.js
'use strict';

const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');
const fs = require('fs');
const { SCENARIOS } = require('./scenarios');
const { BenchmarkMetrics, formatResultsTable } = require('./metrics');

async function runBenchmark(options = {}) {
  const scenarioFilter = options.scenario;
  const scenarios = scenarioFilter
    ? SCENARIOS.filter(s => s.name.includes(scenarioFilter))
    : SCENARIOS;

  console.log(`🏁 Running benchmark: ${scenarios.length} scenarios\n`);

  const results = [];

  for (const scenario of scenarios) {
    console.log(`\n━━━ ${scenario.name} (${scenario.difficulty}) ━━━`);

    // Run BIL method
    try {
      const bilMetrics = await runWithBil(scenario);
      results.push(bilMetrics.toJSON());
      console.log(`  BIL: ${bilMetrics.success ? '✅' : '❌'} ${bilMetrics.steps} steps, ${(bilMetrics.duration / 1000).toFixed(1)}s`);
    } catch (err) {
      console.error(`  BIL: ❌ Error: ${err.message}`);
      const m = new BenchmarkMetrics(scenario.name, 'bil');
      m.errors.push(err.message);
      m.complete(false);
      results.push(m.toJSON());
    }
  }

  // Output results
  console.log('\n\n');
  console.log(formatResultsTable(results));

  // Save to file
  const outputPath = path.resolve(__dirname, '../../../benchmark-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n📁 Results saved to: ${outputPath}`);
}

async function runWithBil(scenario) {
  const metrics = new BenchmarkMetrics(scenario.name, 'bil');

  // Start proxy server
  const cliPath = path.resolve(__dirname, '../cli.js');
  const server = spawn(process.execPath, [cliPath, '--headless'], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  const rl = readline.createInterface({ input: server.stdout, terminal: false, crlfDelay: Infinity });
  let msgId = 0;
  const pending = new Map();

  function call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++msgId;
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error('timeout')); }, 45000);
      pending.set(id, { resolve, reject, timeout });
      server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  rl.on('line', (line) => {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    if (msg.id !== undefined && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      clearTimeout(p.timeout);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
    }
  });

  try {
    // Handshake
    await call('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'bil-benchmark', version: '1.0.0' },
    });
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

    // Navigate
    await call('tools/call', { name: 'browser_navigate', arguments: { url: scenario.url } });
    metrics.steps++;

    // Call browser_goal
    const result = await call('tools/call', { name: 'browser_goal', arguments: { goal: scenario.goal } });
    const text = result?.content?.[0]?.text || '';

    // Parse result
    const completed = text.includes('completed') || text.includes('executable_here');
    const stepsMatch = text.match(/Steps taken: (\d+)/);
    if (stepsMatch) metrics.steps += parseInt(stepsMatch[1]);
    if (text.includes('ESCALATED')) metrics.escalations++;

    metrics.complete(completed);
  } catch (err) {
    metrics.errors.push(err.message);
    metrics.complete(false);
  } finally {
    server.kill();
  }

  return metrics;
}

if (require.main === module) {
  const scenarioArg = process.argv[2];
  runBenchmark({ scenario: scenarioArg }).catch(console.error);
}

module.exports = { runBenchmark };
