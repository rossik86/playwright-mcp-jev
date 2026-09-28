/**
 * ═══════════════════════════════════════════════════════
 * JEV PROXY — Configuration
 *
 * Ładuje konfigurację z CLI args, env vars i .env file.
 * Priorytet: CLI args > env vars > .env file > defaults
 * ═══════════════════════════════════════════════════════
 */

'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_JEV_MODEL = 'typesafe/jev-1.13';
const DEFAULT_JEV_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * Prosty parser .env (key=value, # komentarze, puste linie)
 * Nie nadpisuje istniejących zmiennych środowiskowych.
 */
function loadEnvFile(envPath) {
  try {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      // Nie nadpisuj istniejących env vars
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env nie znaleziony — OK, użyjemy env vars lub defaults
  }
}

/**
 * Załaduj pełną konfigurację proxy.
 * @param {Object} cliArgs - Sparsowane argumenty z CLI
 * @returns {{ jev: { model: string, apiKey: string, baseUrl: string }, playwrightArgs: string[] }}
 */
function loadConfig(cliArgs = {}) {
  // Załaduj .env z katalogu głównego playwright/
  loadEnvFile(path.join(__dirname, '../../.env'));

  return {
    jev: {
      model: cliArgs.jevModel || process.env.JEV_MODEL || DEFAULT_JEV_MODEL,
      apiKey: cliArgs.jevApiKey || process.env.JEV_API_KEY || '',
      baseUrl: cliArgs.jevBaseUrl || process.env.JEV_BASE_URL || DEFAULT_JEV_BASE_URL,
    },
    playwrightArgs: buildPlaywrightArgs(cliArgs),
  };
}

/**
 * Zbuduj tablicę argumentów CLI do przekazania do Playwright MCP child process.
 * @param {Object} cliArgs
 * @returns {string[]}
 */
function buildPlaywrightArgs(cliArgs) {
  const args = [];
  const defaultOutputDir = path.resolve(__dirname, '../../.playwright-mcp');
  args.push('--output-dir', cliArgs.outputDir || defaultOutputDir);

  if (cliArgs.browser) args.push('--browser', cliArgs.browser);
  // Playwright MCP jest domyślnie "headed". Flaga --headless włącza tryb bezgłowy.
  // Playwright MCP nie akceptuje flagi --headed (zgłasza unknown option).
  if (cliArgs.headless && !cliArgs.headed) {
    args.push('--headless');
  }
  if (cliArgs.port) args.push('--port', String(cliArgs.port));
  if (cliArgs.caps) args.push('--caps', cliArgs.caps);
  if (cliArgs.cdpEndpoint) args.push('--cdp-endpoint', cliArgs.cdpEndpoint);
  if (cliArgs.userDataDir) args.push('--user-data-dir', cliArgs.userDataDir);
  if (cliArgs.imageResponses) args.push('--image-responses', cliArgs.imageResponses);

  return args;
}

module.exports = { loadConfig, DEFAULT_JEV_MODEL, DEFAULT_JEV_BASE_URL };
