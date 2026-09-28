/**
 * ═══════════════════════════════════════════════════════
 * JEV PROXY — Stdio JSON-RPC Proxy Server
 *
 * Pośredniczy między klientem MCP (np. Claude / Antigravity / Cursor)
 * a serwerem Playwright MCP.
 *
 * Funkcje:
 * 1. Dodaje wirtualne narzędzie `jev_set_context` do listy narzędzi MCP.
 * 2. Przechwytuje wywołania `jev_set_context` lokalnie i zapamiętuje intencję.
 * 3. Przechwytuje odpowiedzi z `browser_snapshot` i `browser_find`.
 * 4. Przepuszcza snapshot przez Snapshot Compressor i model JEV (Decisions API).
 * 5. Zwraca wzbogaconą odpowiedź z rekomendacją elementów i typem strony.
 * 6. Pozostałe narzędzia (click, type, navigate etc.) przesyła w trybie passthrough.
 * ═══════════════════════════════════════════════════════
 */

'use strict';

const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');
const { extractSnapshot, compressSnapshot } = require('./snapshot-compressor');
const { analyzeWithJev, formatJevResult } = require('./jev-analyzer');
const { GoalHandler, BROWSER_GOAL_TOOL } = require('./goal-handler');

class JevProxy {
  /**
   * @param {{ jev: { model: string, apiKey: string, baseUrl: string }, playwrightArgs: string[] }} config
   */
  constructor(config) {
    this.config = config;
    this.taskContext = '';
    this.pendingCalls = new Map();
    this.goalHandler = null; // lazy init
    this.child = null;
    this.rlClient = null;
    this.rlChild = null;
    this.isStopping = false;
  }

  /**
   * Uruchomienie proxy i procesu potomnego Playwright MCP.
   */
  start() {
    const cliPath = path.resolve(__dirname, '../../cli.js');
    const playwrightDir = path.resolve(__dirname, '../../');
    const childArgs = [cliPath, ...this.config.playwrightArgs];

    // Uruchomienie potomnego Playwright MCP
    this.child = spawn(process.execPath, childArgs, {
      cwd: playwrightDir,
      stdio: ['pipe', 'pipe', 'inherit'],
      env: process.env,
    });

    this.child.on('error', (err) => {
      console.error('[JEV Proxy] Błąd procesu potomnego Playwright:', err);
      process.exit(1);
    });

    this.child.on('exit', (code, signal) => {
      if (!this.isStopping) {
        process.exit(code !== null ? code : (signal ? 1 : 0));
      }
    });

    // Czytanie poleceń od klienta (stdin)
    this.rlClient = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
      crlfDelay: Infinity,
    });

    this.rlClient.on('line', (line) => {
      this.handleIncoming(line).catch((err) => {
        console.error('[JEV Proxy] Błąd obsługi incoming:', err);
      });
    });

    // Czytanie odpowiedzi od Playwright MCP (child stdout)
    this.rlChild = readline.createInterface({
      input: this.child.stdout,
      terminal: false,
      crlfDelay: Infinity,
    });

    this.rlChild.on('line', (line) => {
      this.handleOutgoing(line).catch((err) => {
        console.error('[JEV Proxy] Błąd obsługi outgoing:', err);
      });
    });

    // Obsługa sygnałów zamknięcia
    const shutdown = () => this.stop();
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }

  /**
   * Obsługa wiadomości z klienta MCP -> serwer
   * @param {string} line
   */
  async handleIncoming(line) {
    const trimmed = line.trim();
    if (!trimmed) return;

    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      // Nieprawidłowy JSON — forward do potomka
      this.sendToChild(line + '\n');
      return;
    }

    // 1. Obsługa narzędzia jev_set_context
    if (msg.method === 'tools/call' && msg.params && msg.params.name === 'jev_set_context') {
      const args = msg.params.arguments || {};
      this.taskContext = args.context || '';
      
      const response = {
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          content: [
            {
              type: 'text',
              text: `[JEV] Kontekst zadania zaktualizowany na: "${this.taskContext}"`,
            },
          ],
        },
      };

      this.sendToClient(JSON.stringify(response) + '\n');
      return;
    }

    // 1b. Obsługa narzędzia browser_goal
    if (msg.method === 'tools/call' && msg.params && msg.params.name === 'browser_goal') {
      const args = msg.params.arguments || {};

      // Lazy init GoalHandler z rpc caller
      if (!this.goalHandler) {
        const rpcCall = (method, params) => this._proxyRpcCall(method, params);
        this.goalHandler = new GoalHandler({
          rpcCall,
          jevConfig: this.config.jev,
        });
      }

      try {
        const result = await this.goalHandler.handle(args);
        const response = {
          jsonrpc: '2.0',
          id: msg.id,
          result,
        };
        this.sendToClient(JSON.stringify(response) + '\n');
      } catch (error) {
        const response = {
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            content: [{ type: 'text', text: `[BIL] Error: ${error.message}` }],
            isError: true,
          },
        };
        this.sendToClient(JSON.stringify(response) + '\n');
      }
      return;
    }

    // 2. Zapamiętaj zapytania które wymagają przechwycenia odpowiedzi
    if (msg.id !== undefined && msg.method) {
      if (msg.method === 'tools/list') {
        this.pendingCalls.set(msg.id, { method: 'tools/list' });
      } else if (msg.method === 'tools/call') {
        this.pendingCalls.set(msg.id, {
          method: 'tools/call',
          name: msg.params ? msg.params.name : undefined,
          arguments: msg.params ? msg.params.arguments : undefined,
        });
      }
    }

    // 3. Przekaż do Playwright MCP
    this.sendToChild(JSON.stringify(msg) + '\n');
  }

  /**
   * Obsługa wiadomości z serwera Playwright MCP -> klient
   * @param {string} line
   */
  async handleOutgoing(line) {
    const trimmed = line.trim();
    if (!trimmed) return;

    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      this.sendToClient(line + '\n');
      return;
    }

    if (msg.id !== undefined && this.pendingCalls.has(msg.id)) {
      const pending = this.pendingCalls.get(msg.id);
      this.pendingCalls.delete(msg.id);

      // Pending calls generated internally by _proxyRpcCall
      if (pending._resolve) {
        if (msg.error) {
          pending._reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        } else {
          pending._resolve(msg.result || msg);
        }
        return;
      }

      // A) Odpowiedź na tools/list — dodaj jev_set_context oraz browser_goal
      if (pending.method === 'tools/list') {
        if (msg.result && Array.isArray(msg.result.tools)) {
          const jevTool = {
            name: 'jev_set_context',
            description: 'Ustaw kontekst/intencję zadania dla asystenta JEV (np. "Zaloguj się", "Kup produkt", "Wyszukaj ofertę"). JEV używa tego kontekstu przy analizie drzewa accessibility i rekomenduje optymalne kontrolki [ref].',
            inputSchema: {
              type: 'object',
              properties: {
                context: {
                  type: 'string',
                  description: 'Opis celu zadania lub kolejnego kroku na stronie',
                },
              },
              required: ['context'],
            },
          };
          msg.result.tools.unshift(jevTool);
          msg.result.tools.unshift(BROWSER_GOAL_TOOL);
        }
        this.sendToClient(JSON.stringify(msg) + '\n');
        return;
      }

      // B) Odpowiedź na browser_snapshot lub browser_find — wzbogać analizą JEV
      if (pending.method === 'tools/call' && (pending.name === 'browser_snapshot' || pending.name === 'browser_find')) {
        if (msg.result && Array.isArray(msg.result.content) && !msg.error && !msg.result.isError) {
          try {
            await this.enrichSnapshotResponse(msg, pending);
          } catch (err) {
            console.error('[JEV Proxy] Błąd wzbogacania odpowiedzi JEV:', err);
          }
        }
        this.sendToClient(JSON.stringify(msg) + '\n');
        return;
      }
    }

    // Passthrough dla wszystkich innych wiadomości
    this.sendToClient(JSON.stringify(msg) + '\n');
  }

  /**
   * Wzbogacenie odpowiedzi snapshot/find o decyzje JEV i skompresowane drzewo.
   */
  async enrichSnapshotResponse(msg, pending) {
    const textItem = msg.result.content.find((c) => c.type === 'text');
    if (!textItem || !textItem.text) return;

    // 1. Oddziel kod/metadane strony od drzewa accessibility
    const { prefix, snapshot } = extractSnapshot(textItem.text);
    if (!snapshot || snapshot.length < 10) return;

    // 2. Heurystyczna kompresja snapshota
    const compressed = compressSnapshot(snapshot);

    // 3. Intencja: jeśli ustawiona w jev_set_context, lub z query browser_find
    const intention = this.taskContext || (pending.arguments && pending.arguments.query) || '';

    // 4. Analiza przez model JEV (Decisions API)
    const jevAnalysis = await analyzeWithJev(compressed, intention, this.config.jev);

    // 5. Złożenie końcowej odpowiedzi
    textItem.text = formatJevResult(jevAnalysis, prefix, compressed);
  }

  /**
   * Synchroniczny RPC call do child Playwright MCP.
   * Wysyła JSON-RPC request i czeka na odpowiedź.
   */
  _proxyRpcCall(method, params) {
    return new Promise((resolve, reject) => {
      const id = Date.now() + Math.random();
      this.pendingCalls.set(id, {
        method,
        name: params?.name,
        _resolve: resolve,
        _reject: reject,
      });
      const msg = { jsonrpc: '2.0', id, method, params };
      this.sendToChild(JSON.stringify(msg) + '\n');
    });
  }

  sendToChild(data) {
    if (this.child && this.child.stdin && this.child.stdin.writable) {
      this.child.stdin.write(data);
    }
  }

  sendToClient(data) {
    process.stdout.write(data);
  }

  stop() {
    this.isStopping = true;
    if (this.rlClient) this.rlClient.close();
    if (this.rlChild) this.rlChild.close();
    if (this.child) {
      this.child.kill();
      this.child = null;
    }
  }
}

module.exports = { JevProxy };
