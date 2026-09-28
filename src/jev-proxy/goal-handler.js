// src/jev-proxy/goal-handler.js
'use strict';

const { BilController } = require('./bil-controller');
const { PlaywrightExecutor } = require('./playwright-executor');
const { resolveWithJev } = require('./jev-resolver');
const { validateGoal } = require('./types');

/**
 * Handler for `browser_goal` MCP tool.
 * Orchestrates BIL Controller with real JEV resolver and Playwright executor.
 */
class GoalHandler {
  /**
   * @param {{ rpcCall: Function, jevConfig: { model: string, apiKey: string, baseUrl?: string } }} config
   */
  constructor(config) {
    this.rpcCall = config.rpcCall;
    this.jevConfig = config.jevConfig;
  }

  /**
   * Handle a browser_goal call.
   *
   * @param {{ goal: string }} args
   * @returns {Promise<Object>} MCP tool response
   */
  async handle(args) {
    const validation = validateGoal(args);
    if (!validation.valid) {
      return {
        content: [{ type: 'text', text: `[BIL] Error: ${validation.error}` }],
        isError: true,
      };
    }

    const executor = new PlaywrightExecutor(this.rpcCall);
    const resolver = {
      resolve: async (goal, candidates, options) => {
        return resolveWithJev(goal, candidates, this.jevConfig, options);
      },
    };

    const controller = new BilController({ executor, resolver });
    const result = await controller.run(args);

    return {
      content: [{
        type: 'text',
        text: this.formatResult(result, args.goal),
      }],
    };
  }

  /**
   * Format BIL result for MCP response.
   */
  formatResult(result, goal) {
    const lines = [];
    lines.push('─── BIL RESULT ───');
    lines.push(`🎯 Goal: "${goal}"`);
    lines.push(`📍 Final state: ${result.finalState}`);
    lines.push(`📊 Steps taken: ${result.steps}`);

    if (result.escalated) {
      lines.push('⚠️ ESCALATED: Low confidence — needs main LLM guidance');
    }
    if (result.stopped) {
      lines.push(`🛑 STOPPED: ${result.stopReason}`);
    }

    if (result.usage && result.usage.totalTokens > 0) {
      lines.push(`🪙 JEV Tokens: ${result.usage.totalTokens} (in: ${result.usage.inputTokens}, out: ${result.usage.outputTokens})`);
      if (result.usage.cost > 0) {
        lines.push(`💰 JEV Cost: $${result.usage.cost.toFixed(6)}`);
      }
    }

    if (result.log && result.log.length > 0) {
      lines.push('');
      lines.push('📝 Navigation log:');
      for (const entry of result.log) {
        lines.push(`  Step ${entry.step}: ${entry.goalState} (conf=${entry.confidence !== undefined ? entry.confidence.toFixed(2) : 'N/A'}) ref=${entry.ref || 'none'} candidates=${entry.candidateCount}`);
      }
    }

    return lines.join('\n');
  }
}

/**
 * Tool definition for MCP tools/list.
 */
const BROWSER_GOAL_TOOL = {
  name: 'browser_goal',
  description: 'Autonomicznie nawiguj przeglądarką w kierunku semantycznego celu. BIL Controller automatycznie analizuje stronę, wybiera elementy i nawiguje aż do realizacji celu lub eskalacji. Przykład: { "goal": "zaloguj użytkownika" }',
  inputSchema: {
    type: 'object',
    properties: {
      goal: {
        type: 'string',
        description: 'Semantyczny cel do osiągnięcia (np. "zaloguj użytkownika", "dodaj produkt do koszyka")',
      },
    },
    required: ['goal'],
  },
};

module.exports = { GoalHandler, BROWSER_GOAL_TOOL };
