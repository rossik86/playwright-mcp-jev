// src/jev-proxy/benchmark/runner.js
'use strict';

const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');
const fs = require('fs');
const { SCENARIOS } = require('./scenarios');
const { BenchmarkMetrics, formatResultsTable } = require('./metrics');

/**
 * Parsuj argumenty CLI dla benchmark runnera.
 *
 * Flagi:
 *   --mode <both|bil|classic>   Tryb benchmarku (domyślnie: both)
 *   --bil                       Tylko wersja z JEV / BIL
 *   --classic                   Tylko wersja core Playwright MCP
 *   --both                      Obie wersje (porównanie)
 *   --scenario <nazwa>          Filtruj scenariusze po nazwie
 */
function parseArgs(args) {
  const options = {
    mode: 'both', // 'both' | 'bil' | 'classic'
    scenario: null,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--classic' || arg === '-c') {
      options.mode = 'classic';
    } else if (arg === '--bil' || arg === '-b') {
      options.mode = 'bil';
    } else if (arg === '--both') {
      options.mode = 'both';
    } else if ((arg === '--mode' || arg === '-m') && i + 1 < args.length) {
      options.mode = args[++i];
    } else if ((arg === '--scenario' || arg === '-s') && i + 1 < args.length) {
      options.scenario = args[++i];
    } else if (!arg.startsWith('-')) {
      options.scenario = arg;
    }
  }

  return options;
}

async function runBenchmark(options = {}) {
  const mode = options.mode || 'both';
  const scenarioFilter = options.scenario;
  const scenarios = scenarioFilter
    ? SCENARIOS.filter(s => s.name.includes(scenarioFilter))
    : SCENARIOS;

  console.log(`🏁 Starting Benchmark: ${scenarios.length} scenario(s), Mode: ${mode.toUpperCase()}\n`);

  const results = [];

  for (const scenario of scenarios) {
    console.log(`\n━━━ [${scenario.difficulty.toUpperCase()}] ${scenario.name} ━━━`);
    console.log(`    Goal: "${scenario.goal}"`);
    console.log(`    URL:  ${scenario.url}`);

    // 1. BIL (nasza wersja z JEV)
    if (mode === 'both' || mode === 'bil') {
      try {
        const bilMetrics = await runWithBil(scenario);
        results.push(bilMetrics.toJSON());
        const costStr = bilMetrics.cost > 0 ? `, cost: $${bilMetrics.cost.toFixed(6)}` : '';
        console.log(`  🔹 BIL:     ${bilMetrics.success ? '✅' : '❌'} ${bilMetrics.steps} steps, ${(bilMetrics.duration / 1000).toFixed(2)}s | Main LLM: ~${bilMetrics.mainLlmTokens} tok, JEV: ${bilMetrics.jevTokens} tok${costStr}`);
      } catch (err) {
        console.error(`  🔹 BIL:     ❌ Error: ${err.message}`);
        const m = new BenchmarkMetrics(scenario.name, 'bil');
        m.errors.push(err.message);
        m.complete(false);
        results.push(m.toJSON());
      }
    }

    // 2. CLASSIC (wersja core Playwright MCP)
    if (mode === 'both' || mode === 'classic') {
      try {
        const classicMetrics = await runWithClassic(scenario);
        results.push(classicMetrics.toJSON());
        const dataKb = (classicMetrics.rawBytes / 1024).toFixed(1);
        console.log(`  🔸 CLASSIC: ${classicMetrics.success ? '✅' : '❌'} ${classicMetrics.steps} steps, ${(classicMetrics.duration / 1000).toFixed(2)}s | Main LLM: ~${classicMetrics.mainLlmTokens} tok (${classicMetrics.snapshots} snapshots, ${dataKb} KB)`);
      } catch (err) {
        console.error(`  🔸 CLASSIC: ❌ Error: ${err.message}`);
        const m = new BenchmarkMetrics(scenario.name, 'classic');
        m.errors.push(err.message);
        m.complete(false);
        results.push(m.toJSON());
      }
    }
  }

  // Podsumowanie
  console.log('\n\n');
  console.log(formatResultsTable(results));

  // Zapis do pliku w katalogu głównym
  const outputPath = path.resolve(__dirname, '../../../benchmark-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n📁 Results saved to: ${outputPath}`);
}

/**
 * Uruchomienie scenariusza w wersji BIL (nasz serwer z JEV i browser_goal).
 */
async function runWithBil(scenario) {
  const metrics = new BenchmarkMetrics(scenario.name, 'bil');

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

    // Nawigacja
    await call('tools/call', { name: 'browser_navigate', arguments: { url: scenario.url } });
    metrics.steps++;

    // Wywołanie narzędzia browser_goal
    const result = await call('tools/call', { name: 'browser_goal', arguments: { goal: scenario.goal } });
    const text = result?.content?.[0]?.text || '';

    // Parsowanie wyniku
    const completed = text.includes('completed') || text.includes('executable_here');
    const stepsMatch = text.match(/Steps taken: (\d+)/);
    if (stepsMatch) metrics.steps += parseInt(stepsMatch[1], 10);
    if (text.includes('ESCALATED')) metrics.escalations++;

    // Wyciągnij tokeny JEV z raportu
    const tokensMatch = text.match(/JEV Tokens:\s*(\d+)/i);
    if (tokensMatch) {
      metrics.jevTokens = parseInt(tokensMatch[1], 10);
    }

    const costMatch = text.match(/JEV Cost:\s*\$([0-9.]+)/i);
    if (costMatch) {
      metrics.cost = parseFloat(costMatch[1]);
    }

    // Tokeny głównego LLM: tylko zapytanie { goal: "..." } i krótka odpowiedź statusowa
    const requestTokens = Math.ceil(scenario.goal.length / 3.5) + 20;
    const responseTokens = Math.ceil(text.length / 3.5);
    metrics.mainLlmTokens = requestTokens + responseTokens;

    metrics.complete(completed);
  } catch (err) {
    metrics.errors.push(err.message);
    metrics.complete(false);
  } finally {
    server.kill();
  }

  return metrics;
}

/**
 * Uruchomienie scenariusza w wersji CLASSIC (oficjalny Playwright MCP bez proxy).
 */
async function runWithClassic(scenario) {
  const metrics = new BenchmarkMetrics(scenario.name, 'classic');

  const coreCliPath = path.resolve(__dirname, '../../../cli.js');
  const server = spawn(process.execPath, [coreCliPath, '--headless'], {
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
    // 1. Handshake
    await call('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'classic-benchmark', version: '1.0.0' },
    });
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

    // 2. Nawigacja
    await call('tools/call', { name: 'browser_navigate', arguments: { url: scenario.url } });
    metrics.steps++;

    // 3. Pobranie surowego accessibility snapshota (klasyczny Playwright MCP)
    const snapshotResult = await call('tools/call', { name: 'browser_snapshot', arguments: {} });
    metrics.snapshots++;
    metrics.steps++;

    const text = snapshotResult?.content?.[0]?.text || '';
    const bytes = Buffer.byteLength(text, 'utf-8');
    metrics.rawBytes += bytes;

    // Oblicz tokeny surowego snapshota (standard BPE ~3.8 znaku na token)
    let totalSnapshotTokens = Math.ceil(text.length / 3.8);

    // 4. Analiza surowego accessibility tree w poszukiwaniu elementów pasujących do celu
    const interactiveMatch = text.match(/(button|link|textbox)\s+\[ref=(\w+)\]\s*"([^"]+)"/i);
    let matchedRef = interactiveMatch ? interactiveMatch[2] : null;

    if (matchedRef) {
      try {
        await call('tools/call', { name: 'browser_click', arguments: { ref: matchedRef } });
        metrics.steps++;
        // Kolejny snapshot po interakcji w klasycznym Playwright MCP
        const followUp = await call('tools/call', { name: 'browser_snapshot', arguments: {} });
        metrics.snapshots++;
        metrics.steps++;
        const followUpText = followUp?.content?.[0]?.text || '';
        metrics.rawBytes += Buffer.byteLength(followUpText, 'utf-8');
        totalSnapshotTokens += Math.ceil(followUpText.length / 3.8);
      } catch {
        // Ignoruj błąd kliknięcia w heurystyce
      }
    }

    // W klasycznym Playwright MCP główny LLM przetwarza surowe snapshoty + definicje narzędzi
    metrics.mainLlmTokens = totalSnapshotTokens + (metrics.steps * 150);

    const hasContent = text.length > 100;
    metrics.complete(hasContent);
  } catch (err) {
    metrics.errors.push(err.message);
    metrics.complete(false);
  } finally {
    server.kill();
  }

  return metrics;
}

if (require.main === module) {
  const options = parseArgs(process.argv.slice(2));
  runBenchmark(options).catch(console.error);
}

module.exports = { runBenchmark, parseArgs };
