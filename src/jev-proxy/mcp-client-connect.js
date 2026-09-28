/**
 * Aktywny klient MCP dla Playwright JEV.
 * Uruchamia serwer z oknem przeglądarki (--headed) lub w trybie bezgłowym (--headless),
 * nawiguje pod wskazany URL, pobiera analizę JEV i utrzymuje otwarte okno.
 */

const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');

async function connectMcp(options = {}) {
  const headed = options.headed !== false;
  const targetUrl = options.url || 'https://www.orange.pl';
  const context = options.context || 'Przeglądaj stronę główną Orange Polska, obsłuż zgody cookies i znajdź ofertę';

  const cliPath = path.resolve(__dirname, 'cli.js');
  const modeFlag = headed ? '--headed' : '--headless';

  console.log(`🚀 [MCP Client] Uruchamianie Playwright JEV (${headed ? 'Z OKNEM' : 'BEZGŁOWY'})...`);
  console.log(`   URL: ${targetUrl}`);
  console.log(`   Kontekst zadania: "${context}"\n`);

  const server = spawn(process.execPath, [cliPath, '--browser', 'chromium', modeFlag], {
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
      pending.set(id, { resolve, reject });
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
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }

    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });

  // 1. Handshake MCP
  console.log('🤝 [MCP Client] Handshake MCP (initialize)...');
  const initResult = await call('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'antigravity-mcp-client', version: '1.0.0' },
  });
  console.log(`✅ [MCP Client] Połączono! Serwer: ${initResult.serverInfo?.name || 'Playwright MCP'} (v${initResult.serverInfo?.version || '1.0'})`);

  notify('notifications/initialized');

  // 2. Pobierz listę narzędzi
  const toolsResult = await call('tools/list');
  const tools = toolsResult.tools || [];
  console.log(`✅ [MCP Client] Zarejestrowanych narzędzi: ${tools.length}`);

  // 3. Ustaw kontekst JEV
  await call('tools/call', {
    name: 'jev_set_context',
    arguments: { context },
  });
  console.log('✅ [MCP Client] Kontekst JEV skonfigurowany.');

  // 4. Otwórz stronę w oknie przeglądarki!
  console.log(`🌐 [MCP Client] Otwieranie strony w oknie przeglądarki: ${targetUrl}...`);
  await call('tools/call', {
    name: 'browser_navigate',
    arguments: { url: targetUrl },
  });
  console.log('✅ [MCP Client] Strona załadowana w oknie przeglądarki!');

  // 5. Pobierz snapshot z analizą JEV
  console.log('🤖 [MCP Client] Pobieranie snapshota i decyzji modelu JEV...');
  const snapshotResult = await call('tools/call', {
    name: 'browser_snapshot',
    arguments: {},
  });
  const snapshotText = snapshotResult.content?.[0]?.text;
  console.log('\n================== WYNIK ANALIZY JEV ==================');
  console.log(snapshotText?.split('─── ACCESSIBILITY TREE')[0] || snapshotText);
  console.log('=======================================================\n');

  console.log('🟢 [MCP Client] Okno przeglądarki jest AKTYWNE i widoczne na pulpicie.');
  
  return { server, call, notify };
}

if (require.main === module) {
  const isHeaded = !process.argv.includes('--headless');
  const urlArg = process.argv.find((a) => a.startsWith('http://') || a.startsWith('https://')) || 'https://www.orange.pl';

  connectMcp({ headed: isHeaded, url: urlArg })
    .then(({ server }) => {
      console.log('⏳ Okno pozostanie otwarte przez 120 sekund (możesz przeglądać stronę)...');
      setTimeout(() => {
        console.log('👋 Czas minął — zamykanie sesji przeglądarki.');
        server.kill();
        process.exit(0);
      }, 120000);
    })
    .catch((err) => {
      console.error('❌ [MCP Client] Błąd:', err);
      process.exit(1);
    });
}

module.exports = { connectMcp };
