// src/jev-proxy/candidate-retriever.js
'use strict';

const DEFAULT_MAX_CANDIDATES = 30;

/**
 * Role klikalne (button, link, menu, tab, etc.)
 */
const CLICKABLE_ROLES = new Set([
  'button', 'link', 'menuitem', 'tab', 'switch',
  'option', 'menuitemcheckbox', 'menuitemradio', 'treeitem',
]);

/**
 * Role wypełnialne (textbox, combobox, etc.)
 */
const FILLABLE_ROLES = new Set([
  'textbox', 'searchbox', 'combobox', 'spinbutton',
]);

/**
 * Role czytelne (tekst, nagłówki, paragrafy)
 */
const READABLE_ROLES = new Set([
  'heading', 'link', 'button', 'textbox', 'searchbox',
  'combobox', 'text', 'statictext', 'paragraph',
]);

/**
 * Tokenize text — lowercase, split by non-alphanumeric.
 * @param {string} text
 * @returns {Set<string>}
 */
function tokenize(text) {
  if (!text) return new Set();
  return new Set(
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove diacritics
      .split(/[^a-z0-9ąćęłńóśźż]+/i)
      .filter(t => t.length > 1)
  );
}

/**
 * Token overlap score (0–1): Jaccard similarity.
 * @param {Set<string>} a
 * @param {Set<string>} b
 * @returns {number}
 */
function tokenOverlap(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) {
    if (b.has(t)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Substring match score — czy dowolny token goala jest podstringiem nazwy (lub odwrotnie).
 * @param {string} name
 * @param {Set<string>} goalTokens
 * @returns {number}
 */
function substringScore(name, goalTokens) {
  if (!name) return 0;
  const lower = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let matches = 0;
  for (const token of goalTokens) {
    if (lower.includes(token) || (lower.length >= 3 && token.includes(lower))) {
      matches++;
    } else {
      const stemLen = Math.min(lower.length, token.length);
      if (stemLen >= 4 && (lower.startsWith(token.slice(0, 4)) || token.startsWith(lower.slice(0, 4)))) {
        matches += 0.8;
      }
    }
  }
  return goalTokens.size > 0 ? matches / goalTokens.size : 0;
}

/**
 * Filtruj i rankuj kandydatów.
 *
 * @param {Array<{ ref: string, role: string, name?: string, href?: string, parent?: string }>} elements
 * @param {{ goal: string, type?: string }} query
 * @param {{ maxCandidates?: number }} [options]
 * @returns {Array<Object & { score: number }>}
 */
function retrieveCandidates(elements, query, options = {}) {
  if (!elements || elements.length === 0) return [];

  const maxCandidates = options.maxCandidates || DEFAULT_MAX_CANDIDATES;
  const goalTokens = tokenize(query.goal);
  const actionType = query.type;

  // 1. Filtruj po roli (jeśli znany typ akcji)
  let filtered = elements;
  if (actionType === 'click') {
    filtered = elements.filter(e => CLICKABLE_ROLES.has(e.role));
  } else if (actionType === 'fill') {
    filtered = elements.filter(e => FILLABLE_ROLES.has(e.role));
  } else if (actionType === 'read') {
    filtered = elements.filter(e => READABLE_ROLES.has(e.role));
  }
  // Jeśli brak actionType → nie filtruj po roli

  // 2. Rankuj
  const scored = filtered.map(el => {
    const nameTokens = tokenize(el.name);
    const hrefTokens = tokenize(el.href);
    const parentTokens = tokenize(el.parent);

    // a) Token overlap: goal ↔ name
    const nameOverlap = tokenOverlap(goalTokens, nameTokens);

    // b) Substring match: goal tokens in name
    const nameSubstr = substringScore(el.name, goalTokens);

    // c) Href match
    const hrefOverlap = tokenOverlap(goalTokens, hrefTokens);

    // d) Parent context boost
    const parentOverlap = tokenOverlap(goalTokens, parentTokens) * 0.3;

    // e) Role bonus — clickable elements get slight boost for navigation goals
    let roleBonus = 0;
    if (!actionType) {
      if (CLICKABLE_ROLES.has(el.role)) roleBonus = 0.05;
    }

    const score = Math.min(1, nameOverlap * 0.4 + nameSubstr * 0.35 + hrefOverlap * 0.15 + parentOverlap + roleBonus);

    return { ...el, score };
  });

  // 3. Sortuj malejąco po score
  scored.sort((a, b) => b.score - a.score);

  // 4. Ogranicz do maxCandidates
  return scored.slice(0, maxCandidates);
}

module.exports = { retrieveCandidates, tokenize, tokenOverlap };
