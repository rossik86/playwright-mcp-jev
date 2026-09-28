// src/jev-proxy/normalizer.js
'use strict';

const { parseLine } = require('./snapshot-compressor');

const MAX_NAME_LENGTH = 100;
const MAX_DUPLICATES = 2;

/**
 * Role interaktywne które zawsze zostaną w wyniku.
 */
const INTERACTIVE = new Set([
  'button', 'link', 'textbox', 'checkbox', 'radio',
  'combobox', 'menuitem', 'tab', 'switch', 'slider',
  'spinbutton', 'searchbox', 'option', 'menuitemcheckbox',
  'menuitemradio', 'treeitem', 'select',
]);

/**
 * Role strukturalne/landmark — włączamy jako kontekst (parent).
 */
const STRUCTURAL = new Set([
  'navigation', 'main', 'banner', 'contentinfo',
  'form', 'dialog', 'alertdialog', 'search',
  'heading', 'region', 'complementary',
]);

/**
 * Zamień surowy accessibility tree na uproszczoną strukturę NormalizedElement[].
 *
 * Zachowuje:
 * - Elementy interaktywne (button, link, textbox, ...)
 * - Headingi (jako kontekst)
 *
 * Usuwa:
 * - Puste generic node'y
 * - Dekoracyjne elementy (img bez alt, separator, ...)
 * - Duplikaty (>MAX_DUPLICATES tego samego role+name)
 * - Wielkie bloki tekstu (truncation)
 * - Niewidoczne elementy (hidden)
 *
 * @param {string} snapshotText
 * @returns {Array<{ ref: string, role: string, name: string, href?: string, parent?: string }>}
 */
function normalizeSnapshot(snapshotText) {
  if (!snapshotText || typeof snapshotText !== 'string' || !snapshotText.trim()) {
    return [];
  }

  const lines = snapshotText.split('\n');
  const parsed = lines.map(parseLine);

  // Zbuduj mapę parent dla każdej linii
  const parentMap = buildParentMap(parsed);

  // Filtruj i normalizuj
  const results = [];
  const seenDupes = new Map(); // key: "role:name" → count

  for (let i = 0; i < parsed.length; i++) {
    const p = parsed[i];

    // Skip puste/nieznane linie
    if (!p.role) continue;

    // Musi być interaktywny LUB heading
    const isInteractive = INTERACTIVE.has(p.role);
    const isHeading = p.role === 'heading';

    if (!isInteractive && !isHeading) continue;

    // Skip jeśli brak ref
    if (!p.ref) continue;

    // Skip hidden/disabled indicators
    if (p.text && /\bhidden\b/i.test(p.raw) && !/\bvisible\b/i.test(p.raw)) continue;

    // Wyciągnij name
    let name = extractName(p);
    if (!name || name === '(brak labelu)') name = '';

    // Truncate long text
    if (name.length > MAX_NAME_LENGTH) {
      name = name.slice(0, MAX_NAME_LENGTH - 3) + '...';
    }

    // Deduplication
    const dupeKey = `${p.role}:${name}`;
    const count = seenDupes.get(dupeKey) || 0;
    if (count >= MAX_DUPLICATES) continue;
    seenDupes.set(dupeKey, count + 1);

    // Wyciągnij href
    const href = extractHref(p.raw);

    // Parent info
    const parentIdx = parentMap.get(i);
    const parent = parentIdx !== undefined ? describeParent(parsed[parentIdx]) : undefined;

    results.push({
      ref: p.ref,
      role: p.role,
      name: name || '',
      ...(href ? { href } : {}),
      ...(parent ? { parent } : {}),
    });
  }

  return results;
}

/**
 * Zbuduj mapę child index → parent index.
 */
function buildParentMap(parsed) {
  const map = new Map();
  const stack = []; // stack of { index, indent }

  for (let i = 0; i < parsed.length; i++) {
    const indent = parsed[i].indent;

    // Pop stack aż parent ma mniejszy indent
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    if (stack.length > 0) {
      map.set(i, stack[stack.length - 1].index);
    }

    stack.push({ index: i, indent });
  }

  return map;
}

/**
 * Wyciągnij tekst/label z parsowanej linii.
 */
function extractName(parsed) {
  // Tekst w cudzysłowach
  const quoteMatch = parsed.raw.match(/"([^"]+)"/);
  if (quoteMatch) return quoteMatch[1].trim();

  // Tekst po roli (np. "heading: Witamy")
  if (parsed.text) return parsed.text.trim();

  return '';
}

/**
 * Wyciągnij href/url z surowej linii.
 */
function extractHref(raw) {
  const match = raw.match(/\[url="?([^"\]]+)"?\]/);
  if (match) return match[1];

  const hrefMatch = raw.match(/\bhref="?([^"\s\]]+)"?/);
  if (hrefMatch) return hrefMatch[1];

  return undefined;
}

/**
 * Opisz parent element krótko.
 */
function describeParent(parsed) {
  if (!parsed) return undefined;
  const name = extractName(parsed);
  return name ? `${parsed.role}:${name}` : parsed.role;
}

module.exports = { normalizeSnapshot };
