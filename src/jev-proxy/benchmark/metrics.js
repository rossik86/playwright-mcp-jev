// src/jev-proxy/benchmark/metrics.js
'use strict';

/**
 * Metryki zbierane podczas benchmarku.
 */
class BenchmarkMetrics {
  constructor(scenarioName, method) {
    this.scenario = scenarioName;
    this.method = method; // 'bil' | 'classic'
    this.startTime = Date.now();
    this.endTime = null;
    this.success = false;
    this.steps = 0;
    this.snapshots = 0;
    this.rawBytes = 0;
    this.mainLlmTokens = 0; // Tokeny obciążające główny LLM klienta
    this.jevTokens = 0;     // Tokeny zużyte przez lokalny resolver JEV
    this.cost = 0;          // Koszt wywołań JEV API
    this.escalations = 0;
    this.errors = [];
  }

  complete(success) {
    this.endTime = Date.now();
    this.success = success;
  }

  get duration() {
    return (this.endTime || Date.now()) - this.startTime;
  }

  toJSON() {
    return {
      scenario: this.scenario,
      method: this.method,
      success: this.success,
      steps: this.steps,
      duration: this.duration,
      snapshots: this.snapshots,
      rawBytes: this.rawBytes,
      mainLlmTokens: this.mainLlmTokens,
      jevTokens: this.jevTokens,
      cost: this.cost,
      escalations: this.escalations,
      errors: this.errors,
    };
  }
}

/**
 * Agreguj wyniki wielu scenariuszy.
 */
function aggregateResults(results) {
  const byMethod = {};
  for (const r of results) {
    if (!byMethod[r.method]) byMethod[r.method] = [];
    byMethod[r.method].push(r);
  }

  const summary = {};
  for (const [method, runs] of Object.entries(byMethod)) {
    const successes = runs.filter(r => r.success);
    summary[method] = {
      total: runs.length,
      successRate: runs.length > 0 ? successes.length / runs.length : 0,
      avgSteps: runs.length > 0 ? runs.reduce((s, r) => s + r.steps, 0) / runs.length : 0,
      avgDuration: runs.length > 0 ? runs.reduce((s, r) => s + r.duration, 0) / runs.length : 0,
      totalSnapshots: runs.reduce((s, r) => s + (r.snapshots || 0), 0),
      totalRawBytes: runs.reduce((s, r) => s + (r.rawBytes || 0), 0),
      avgMainLlmTokens: runs.length > 0 ? Math.round(runs.reduce((s, r) => s + (r.mainLlmTokens || 0), 0) / runs.length) : 0,
      avgJevTokens: runs.length > 0 ? Math.round(runs.reduce((s, r) => s + (r.jevTokens || 0), 0) / runs.length) : 0,
      totalCost: runs.reduce((s, r) => s + (r.cost || 0), 0),
      totalEscalations: runs.reduce((s, r) => s + (r.escalations || 0), 0),
    };
  }

  return summary;
}

/**
 * Formatuj wyniki jako tabelę porównawczą.
 */
function formatResultsTable(results) {
  const summary = aggregateResults(results);
  const lines = [];

  lines.push('═══════════════════════════════════════════════════════════════════════');
  lines.push('             BENCHMARK RESULTS: BIL vs CLASSIC PLAYWRIGHT              ');
  lines.push('═══════════════════════════════════════════════════════════════════════');
  lines.push('');

  const bilStats = summary.bil;
  const classicStats = summary.classic;

  for (const [method, stats] of Object.entries(summary)) {
    const isBil = method === 'bil';
    const label = isBil ? 'BIL (Browser Intent Layer + JEV)' : 'CLASSIC (Vanilla Playwright MCP)';
    lines.push(`📊 ${label}`);
    lines.push(`   Success rate:     ${(stats.successRate * 100).toFixed(1)}% (${stats.total} run${stats.total > 1 ? 's' : ''})`);
    lines.push(`   Avg steps:        ${stats.avgSteps.toFixed(1)}`);
    lines.push(`   Avg duration:     ${(stats.avgDuration / 1000).toFixed(2)}s`);
    
    // Token metrics
    lines.push(`   Main LLM Tokens:  ~${stats.avgMainLlmTokens.toLocaleString()} tokens/run`);
    if (isBil) {
      lines.push(`   JEV Local Tokens: ${stats.avgJevTokens.toLocaleString()} tokens/run (Decisions API)`);
      if (stats.totalCost > 0) {
        lines.push(`   JEV Total Cost:   $${stats.totalCost.toFixed(6)}`);
      }
      if (classicStats && classicStats.avgMainLlmTokens > 0) {
        const savings = Math.max(0, (1 - stats.avgMainLlmTokens / classicStats.avgMainLlmTokens) * 100);
        lines.push(`   Token Savings:    ${savings.toFixed(1)}% less tokens to main LLM context 🚀`);
      }
    } else {
      lines.push(`   Snapshot Payload: ${(stats.totalRawBytes / 1024).toFixed(1)} KB (sent directly to LLM context)`);
    }

    if (stats.totalEscalations > 0) {
      lines.push(`   Escalations:      ${stats.totalEscalations}`);
    }
    lines.push('');
  }

  // Per-scenario breakdown
  lines.push('─── Szczegóły per scenariusz ───');
  for (const r of results) {
    const status = r.success ? '✅' : '❌';
    const tokensInfo = r.method === 'bil'
      ? `Main: ~${r.mainLlmTokens} tok, JEV: ${r.jevTokens} tok`
      : `Main: ~${r.mainLlmTokens} tok (${(r.rawBytes / 1024).toFixed(1)}KB)`;
    lines.push(`${status} [${r.method.padEnd(7)}] ${r.scenario}: ${r.steps} steps, ${(r.duration / 1000).toFixed(2)}s | ${tokensInfo}`);
  }

  return lines.join('\n');
}

module.exports = { BenchmarkMetrics, aggregateResults, formatResultsTable };
