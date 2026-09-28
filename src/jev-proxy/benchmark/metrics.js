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
    this.jevTokens = 0;
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
      jevTokens: this.jevTokens,
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
      totalSnapshots: runs.reduce((s, r) => s + r.snapshots, 0),
      totalJevTokens: runs.reduce((s, r) => s + r.jevTokens, 0),
      totalEscalations: runs.reduce((s, r) => s + r.escalations, 0),
    };
  }

  return summary;
}

/**
 * Formatuj wyniki jako tabelę.
 */
function formatResultsTable(results) {
  const summary = aggregateResults(results);
  const lines = [];

  lines.push('═══════════════════════════════════════════════════════');
  lines.push('                  BENCHMARK RESULTS                   ');
  lines.push('═══════════════════════════════════════════════════════');
  lines.push('');

  for (const [method, stats] of Object.entries(summary)) {
    lines.push(`📊 ${method.toUpperCase()}`);
    lines.push(`   Success rate:    ${(stats.successRate * 100).toFixed(1)}%`);
    lines.push(`   Avg steps:       ${stats.avgSteps.toFixed(1)}`);
    lines.push(`   Avg duration:    ${(stats.avgDuration / 1000).toFixed(1)}s`);
    lines.push(`   Total snapshots: ${stats.totalSnapshots}`);
    lines.push(`   JEV tokens:      ${stats.totalJevTokens}`);
    lines.push(`   Escalations:     ${stats.totalEscalations}`);
    lines.push('');
  }

  // Per-scenario breakdown
  lines.push('─── Per Scenario ───');
  for (const r of results) {
    const status = r.success ? '✅' : '❌';
    lines.push(`${status} [${r.method}] ${r.scenario}: ${r.steps} steps, ${(r.duration / 1000).toFixed(1)}s`);
  }

  return lines.join('\n');
}

module.exports = { BenchmarkMetrics, aggregateResults, formatResultsTable };
