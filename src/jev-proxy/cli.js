#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════
 * JEV PROXY — CLI Entry Point
 *
 * Uruchamia Playwright MCP w tandemie z modelem JEV.
 *
 * Użycie:
 *   node src/jev-proxy/cli.js [opcje]
 *
 * Opcje JEV:
 *   --jev-model <model>     Identyfikator modelu (domyślnie: typesafe/jev-1.13)
 *   --jev-api-key <klucz>   Klucz API OpenRouter
 *   --jev-base-url <url>    Base URL dla API OpenRouter
 *
 * Opcje Playwright:
 *   --browser <name>        Przeglądarka: chromium, firefox, webkit (domyślnie: chromium)
 *   --headed                Uruchom w trybie widocznym (z oknem)
 *   --headless              Uruchom w trybie bezgłowym (domyślnie)
 *   --caps <list>           Włączone capabilities (np. tabs,pdf,files)
 *   --port <number>         Port dla serwera MCP (opcjonalny)
 *   --cdp-endpoint <url>    Zewnętrzny endpoint CDP
 *   --user-data-dir <path>  Katalog profilu przeglądarki
 *   --image-responses <val> Obsługa obrazów: allow lub omit
 *   -h, --help              Wyświetl tę pomoc
 * ═══════════════════════════════════════════════════════
 */

'use strict';

const { loadConfig } = require('./config');
const { JevProxy } = require('./proxy-server');

function parseArgs(args) {
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--headed') {
      parsed.headed = true;
    } else if (arg === '--headless') {
      parsed.headless = true;
    } else if (arg === '--jev-model' && i + 1 < args.length) {
      parsed.jevModel = args[++i];
    } else if (arg === '--jev-api-key' && i + 1 < args.length) {
      parsed.jevApiKey = args[++i];
    } else if (arg === '--jev-base-url' && i + 1 < args.length) {
      parsed.jevBaseUrl = args[++i];
    } else if (arg === '--browser' && i + 1 < args.length) {
      parsed.browser = args[++i];
    } else if (arg === '--port' && i + 1 < args.length) {
      parsed.port = args[++i];
    } else if (arg === '--caps' && i + 1 < args.length) {
      parsed.caps = args[++i];
    } else if (arg === '--cdp-endpoint' && i + 1 < args.length) {
      parsed.cdpEndpoint = args[++i];
    } else if (arg === '--user-data-dir' && i + 1 < args.length) {
      parsed.userDataDir = args[++i];
    } else if (arg === '--output-dir' && i + 1 < args.length) {
      parsed.outputDir = args[++i];
    } else if (arg === '--image-responses' && i + 1 < args.length) {
      parsed.imageResponses = args[++i];
    }
  }
  return parsed;
}

function printHelp() {
  console.log(`
Playwright JEV Proxy — Two-Model MCP Server

Użycie:
  node src/jev-proxy/cli.js [opcje]

Opcje JEV:
  --jev-model <model>     Identyfikator modelu (domyślnie: typesafe/jev-1.13)
  --jev-api-key <klucz>   Klucz API OpenRouter (lub zmienna JEV_API_KEY w .env)
  --jev-base-url <url>    Base URL dla API OpenRouter (domyślnie: https://openrouter.ai/api/v1)

Opcje Playwright:
  --browser <name>        Przeglądarka: chromium, firefox, webkit (domyślnie: chromium)
  --headed                Uruchom z oknem przeglądarki
  --headless              Uruchom w trybie headless
  --caps <list>           Włączone capabilities (np. tabs,pdf,files)
  --port <number>         Port dla serwera MCP (opcjonalny)
  --cdp-endpoint <url>    Zewnętrzny endpoint CDP
  --user-data-dir <path>  Katalog danych użytkownika przeglądarki
  --image-responses <val> Obsługa obrazów: allow lub omit
  -h, --help              Wyświetl tę pomoc
`);
}

function main() {
  try {
    process.chdir(require('path').resolve(__dirname, '../..'));
  } catch (e) {}
  const cliArgs = parseArgs(process.argv.slice(2));

  if (cliArgs.help) {
    printHelp();
    process.exit(0);
  }

  const config = loadConfig(cliArgs);
  const proxy = new JevProxy(config);
  proxy.start();
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs, printHelp };
