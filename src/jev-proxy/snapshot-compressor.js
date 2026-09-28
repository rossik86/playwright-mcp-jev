/**
 * ═══════════════════════════════════════════════════════
 * JEV PROXY — Snapshot Compressor
 *
 * Heurystyczny pre-processor accessibility tree.
 * Redukuje rozmiar snapshota PRZED wysłaniem do JEV LLM.
 * Nie używa LLM — tylko reguły tekstowe.
 *
 * Reguły:
 * 1. Zachowaj ZAWSZE elementy interaktywne (button, link, textbox...)
 * 2. Zachowaj ZAWSZE landmarki (navigation, main, form, heading...)
 * 3. Usuń puste generic kontenery (bez tekstu, bez refu)
 * 4. Spłaszcz generic → generic → child do child
 * 5. Obetnij listy >5 identycznych sibling → 3 + "...i N więcej"
 * ═══════════════════════════════════════════════════════
 */

'use strict';

/**
 * Elementy interaktywne — NIGDY nie usuwać.
 */
const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'checkbox', 'radio',
  'combobox', 'menuitem', 'tab', 'switch', 'slider',
  'spinbutton', 'searchbox', 'option', 'menuitemcheckbox',
  'menuitemradio', 'treeitem',
]);

/**
 * Elementy strukturalne/landmarks — zachowaj.
 */
const LANDMARK_ROLES = new Set([
  'navigation', 'main', 'contentinfo', 'banner',
  'complementary', 'search', 'form', 'region',
  'heading', 'list', 'table', 'row', 'cell',
  'dialog', 'alert', 'alertdialog', 'img',
  'figure', 'article', 'section',
]);

/**
 * Wyodrębnia accessibility snapshot z pełnej odpowiedzi MCP.
 * Odpowiedź MCP może zawierać kod Playwright, metadane strony, i snapshot.
 *
 * @param {string} responseText - Pełna odpowiedź tekstowa z MCP
 * @returns {{ prefix: string, snapshot: string }}
 */
function extractSnapshot(responseText) {
  // Szukamy początku accessibility tree
  // Typowe markery: "Accessibility snapshot:", "- document", "- page"
  const markers = [
    'Accessibility snapshot:',
    'Page snapshot:',
  ];

  for (const marker of markers) {
    const idx = responseText.indexOf(marker);
    if (idx !== -1) {
      const afterMarker = idx + marker.length;
      // Pomiń whitespace po markerze
      let snapshotStart = afterMarker;
      while (snapshotStart < responseText.length && responseText[snapshotStart] === '\n') {
        snapshotStart++;
      }
      // Sprawdź czy snapshot jest w bloku kodu (```)
      const remaining = responseText.slice(snapshotStart);
      if (remaining.startsWith('```')) {
        const endBlock = remaining.indexOf('```', 3);
        if (endBlock !== -1) {
          // Pomiń pierwszą linię ``` (np. ```yaml)
          const firstNewline = remaining.indexOf('\n', 3);
          const snapshot = remaining.slice(firstNewline + 1, endBlock).trim();
          return {
            prefix: responseText.slice(0, idx + marker.length),
            snapshot,
          };
        }
      }
      return {
        prefix: responseText.slice(0, idx + marker.length),
        snapshot: remaining.trim(),
      };
    }
  }

  // Jeśli nie ma markera, szukamy linii zaczynającej się od "- " (tree root)
  const lines = responseText.split('\n');
  let treeStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    if (trimmed.startsWith('- ') && /^- \w+/.test(trimmed)) {
      treeStart = i;
      break;
    }
  }

  if (treeStart > 0) {
    return {
      prefix: lines.slice(0, treeStart).join('\n'),
      snapshot: lines.slice(treeStart).join('\n'),
    };
  }

  // Fallback: cały tekst to snapshot
  return { prefix: '', snapshot: responseText };
}

/**
 * Parsuje pojedynczą linię accessibility tree.
 *
 * @param {string} line - Linia tekstu (np. "  - button [ref=e5] \"Submit\"")
 * @returns {{ indent: number, role: string, ref: string|null, text: string, raw: string }}
 */
function parseLine(line) {
  const raw = line;
  // Oblicz indent (ilość spacji przed "- ")
  const stripped = line.replace(/\t/g, '  ');
  const indent = stripped.length - stripped.trimStart().length;
  const trimmed = stripped.trimStart();

  // Usuń prefix "- "
  const content = trimmed.startsWith('- ') ? trimmed.slice(2) : trimmed;

  // Wyciągnij rolę (pierwsze słowo)
  const roleMatch = content.match(/^(\w+)/);
  const role = roleMatch ? roleMatch[1].toLowerCase() : '';

  // Wyciągnij ref
  const refMatch = content.match(/\[ref=(\w+)\]/);
  const ref = refMatch ? refMatch[1] : null;

  // Wyciągnij tekst (po dwukropku lub w cudzysłowach)
  const textMatch = content.match(/:\s*(.+)$/) || content.match(/"([^"]+)"/);
  const text = textMatch ? textMatch[1].trim() : '';

  return { indent, role, ref, text, raw };
}

/**
 * Kompresuje accessibility tree heurystycznie.
 *
 * @param {string} snapshotText - Surowy accessibility tree
 * @returns {string} Skompresowany tree
 */
function compressSnapshot(snapshotText) {
  if (!snapshotText || !snapshotText.trim()) return snapshotText;

  const lines = snapshotText.split('\n');
  const parsed = lines.map(parseLine);

  // Pass 1: Oznacz linie do zachowania/usunięcia
  const keep = new Array(parsed.length).fill(false);

  for (let i = 0; i < parsed.length; i++) {
    const p = parsed[i];

    // Zawsze zachowaj elementy interaktywne
    if (INTERACTIVE_ROLES.has(p.role)) {
      keep[i] = true;
      // Zachowaj też rodziców (linie z mniejszym indent)
      markParents(keep, parsed, i);
      continue;
    }

    // Zawsze zachowaj landmarki
    if (LANDMARK_ROLES.has(p.role)) {
      keep[i] = true;
      markParents(keep, parsed, i);
      continue;
    }

    // Zachowaj elementy z refem
    if (p.ref) {
      keep[i] = true;
      markParents(keep, parsed, i);
      continue;
    }

    // Zachowaj elementy z tekstem (nie-generic)
    if (p.text && p.role !== 'generic') {
      keep[i] = true;
      markParents(keep, parsed, i);
      continue;
    }

    // Zachowaj tekst wewnątrz elementów
    if (p.role === 'text' || p.role === 'statictext') {
      keep[i] = true;
      markParents(keep, parsed, i);
      continue;
    }
  }

  // Pass 2: Obetnij powtarzalne listy sibling
  // Grupuj zachowane elementy po indent i roli — jeśli >5 sibling tego samego
  // typu pod tym samym rodzicem, zachowaj 3 + podsumowanie.
  const kept = [];
  for (let i = 0; i < parsed.length; i++) {
    if (keep[i]) kept.push({ idx: i, ...parsed[i] });
  }

  // Wykryj grupy sibling (ten sam indent, ten sam role, bezpośrednio po sobie)
  const groups = []; // { startKeptIdx, endKeptIdx, role, indent }
  let gStart = 0;
  for (let k = 1; k <= kept.length; k++) {
    const same = k < kept.length
      && kept[k].role === kept[gStart].role
      && kept[k].indent === kept[gStart].indent
      // Sprawdź że nie ma elementu o niższym indent pomiędzy (inny parent)
      && !hasLowerIndentBetween(parsed, kept[gStart].idx, kept[k].idx, kept[gStart].indent);

    if (!same) {
      if (k - gStart > 5) {
        groups.push({
          startKeptIdx: gStart,
          endKeptIdx: k - 1,
          role: kept[gStart].role,
          indent: kept[gStart].indent,
          total: k - gStart,
        });
      }
      gStart = k;
    }
  }

  // Zbuduj set linii do pominięcia (kept indices od 4. siblinga w grupie)
  const skipSet = new Set();
  const insertAfter = new Map(); // keptIdx → summary text to insert
  for (const g of groups) {
    const keepCount = 3;
    const skipped = g.total - keepCount;
    for (let k = g.startKeptIdx + keepCount; k <= g.endKeptIdx; k++) {
      skipSet.add(k);
    }
    // Wstaw podsumowanie po 3. elemencie
    const indentStr = ' '.repeat(g.indent);
    insertAfter.set(g.startKeptIdx + keepCount - 1,
      `${indentStr}  ...i ${skipped} więcej ${g.role}`);
  }

  // Zbuduj wynik
  const result = [];
  for (let k = 0; k < kept.length; k++) {
    if (skipSet.has(k)) continue;
    result.push(kept[k].raw);
    if (insertAfter.has(k)) {
      result.push(insertAfter.get(k));
    }
  }

  return result.join('\n');
}

/**
 * Sprawdź czy między dwoma indeksami (exclusive) istnieje element
 * o indent niższym niż podany — co oznacza zmianę parenta.
 */
function hasLowerIndentBetween(parsed, fromIdx, toIdx, indent) {
  for (let i = fromIdx + 1; i < toIdx; i++) {
    if (parsed[i].indent < indent) return true;
  }
  return false;
}

/**
 * Oznacz rodziców danego elementu jako do zachowania.
 */
function markParents(keep, parsed, idx) {
  const targetIndent = parsed[idx].indent;
  for (let j = idx - 1; j >= 0; j--) {
    if (parsed[j].indent < targetIndent) {
      keep[j] = true;
      if (parsed[j].indent === 0) break;
    }
  }
}


/**
 * Policz sibling tego samego typu w sąsiedztwie.
 */
function countSameRoleSiblings(parsed, keep, idx) {
  const role = parsed[idx].role;
  const indent = parsed[idx].indent;
  let count = 0;

  // Szukaj wstecz
  for (let j = idx; j >= 0; j--) {
    if (!keep[j]) continue;
    if (parsed[j].indent < indent) break;
    if (parsed[j].indent === indent && parsed[j].role === role) count++;
  }
  // Szukaj wprzód
  for (let j = idx + 1; j < parsed.length; j++) {
    if (!keep[j]) continue;
    if (parsed[j].indent < indent) break;
    if (parsed[j].indent === indent && parsed[j].role === role) count++;
  }

  return count;
}

/**
 * Oblicz indeks siblinga (0-based) tego samego typu.
 */
function getSiblingIndex(parsed, keep, idx) {
  const role = parsed[idx].role;
  const indent = parsed[idx].indent;
  let index = 0;

  for (let j = idx - 1; j >= 0; j--) {
    if (!keep[j]) continue;
    if (parsed[j].indent < indent) break;
    if (parsed[j].indent === indent && parsed[j].role === role) index++;
  }

  return index;
}

/**
 * Złóż odpowiedź z powrotem z prefiksu i przetworzonego snapshota.
 *
 * @param {string} prefix - Część przed snapshotem (kod, metadane)
 * @param {string} processedSnapshot - Przetworzony snapshot
 * @returns {string}
 */
function rebuildResponse(prefix, processedSnapshot) {
  if (!prefix) return processedSnapshot;
  return `${prefix}\n\n${processedSnapshot}`;
}

module.exports = { extractSnapshot, compressSnapshot, rebuildResponse, parseLine };
