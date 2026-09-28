/**
 * ═══════════════════════════════════════════════════════
 * JEV PROXY — JEV Analyzer (Decisions API)
 *
 * Wywołuje model JEV (typesafe/jev-1.13) via OpenRouter
 * Decisions API (/api/alpha/decisions).
 *
 * JEV to model decyzyjny (System One) — nie generuje tekstu.
 * Odpowiada na pytania structured:
 * - noul (prawdopodobieństwo tak/nie)
 * - choice (wybór z opcji)
 * - score (pozycja na rubrice)
 *
 * Używamy go do:
 * 1. Identyfikacji elementów pasujących do intencji użytkownika
 * 2. Klasyfikacji sekcji strony
 * 3. Oceny istotności elementów
 *
 * Brak dodatkowych zależności — używa globalnego fetch (Node 18+).
 * ═══════════════════════════════════════════════════════
 */

'use strict';

const { extractSnapshot, compressSnapshot } = require('./snapshot-compressor');

/**
 * Wyciągnij listę interaktywnych elementów z accessibility tree.
 * Zwraca tablicę { ref, role, label } obiektów.
 *
 * @param {string} snapshotText
 * @returns {Array<{ ref: string, role: string, label: string, line: string }>}
 */
function extractInteractiveElements(snapshotText) {
  const INTERACTIVE = new Set([
    'button', 'link', 'textbox', 'checkbox', 'radio',
    'combobox', 'menuitem', 'tab', 'switch', 'slider',
    'spinbutton', 'searchbox', 'option', 'menuitemcheckbox',
    'menuitemradio', 'treeitem', 'select',
  ]);

  const elements = [];
  const lines = snapshotText.split('\n');

  for (const line of lines) {
    const trimmed = line.trimStart().replace(/^- /, '');
    const roleMatch = trimmed.match(/^(\w+)/);
    if (!roleMatch) continue;

    const role = roleMatch[1].toLowerCase();
    if (!INTERACTIVE.has(role)) continue;

    const refMatch = trimmed.match(/\[ref=(\w+)\]/);
    if (!refMatch) continue;

    const ref = refMatch[1];

    // Wyciągnij label — tekst w cudzysłowach lub po dwukropku
    const labelMatch = trimmed.match(/"([^"]+)"/) || trimmed.match(/:\s*(.+)$/);
    const label = labelMatch ? labelMatch[1].trim() : '(brak labelu)';

    elements.push({ ref, role, label, line: trimmed });
  }

  return elements;
}

/**
 * Wywołaj JEV Decisions API żeby wybrać elementy pasujące do intencji.
 *
 * @param {string} snapshotText - Accessibility tree (surowy lub kompresowany)
 * @param {string} intention - Intencja użytkownika (np. "zaloguj się")
 * @param {{ model: string, apiKey: string, baseUrl: string }} jevConfig
 * @returns {Promise<Object>} Odpowiedzi JEV na pytania o elementy
 */
async function analyzeWithJev(snapshotText, intention, jevConfig) {
  if (!jevConfig.apiKey) {
    console.error('[JEV] Brak API key — fallback na surowy snapshot');
    return buildFallbackResult(snapshotText, intention);
  }

  const elements = extractInteractiveElements(snapshotText);

  if (elements.length === 0) {
    return buildFallbackResult(snapshotText, intention);
  }

  // Zbuduj pytania dla JEV
  const questions = buildQuestions(elements, intention);

  // Zbuduj state — skompresowany snapshot + intencja
  const state = buildState(snapshotText, intention, elements);

  try {
    const decisionsUrl = 'https://openrouter.ai/api/alpha/decisions';
    const response = await fetch(decisionsUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jevConfig.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://playwright-jev-proxy.local',
        'X-Title': 'Playwright JEV Proxy',
      },
      body: JSON.stringify({
        model: jevConfig.model,
        state,
        questions,
      }),
      signal: AbortSignal.timeout(15000), // 15s timeout
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown error');
      console.error(`[JEV] API error ${response.status}: ${errorText}`);
      return buildFallbackResult(snapshotText, intention);
    }

    const data = await response.json();
    return processJevResponse(data, elements, snapshotText, intention);

  } catch (error) {
    console.error(`[JEV] Error: ${error.message}`);
    return buildFallbackResult(snapshotText, intention);
  }
}

/**
 * Zbuduj state (kontekst) dla JEV Decisions API.
 */
function buildState(snapshotText, intention, elements) {
  const elemList = elements
    .map(e => `[${e.ref}] ${e.role}: "${e.label}"`)
    .join('\n');

  return `INTENCJA UŻYTKOWNIKA: ${intention || 'brak'}\n\nELEMENTY INTERAKTYWNE:\n${elemList}\n\nPEŁNE DRZEWO:\n${snapshotText}`;
}

/**
 * Zbuduj pytania (questions) dla JEV.
 * Każde pytanie dotyczy jednego aspektu analizy.
 */
function buildQuestions(elements, intention) {
  const questions = {};

  // Pytanie 1: Który element jest najbardziej istotny dla intencji?
  if (intention && elements.length > 1) {
    const choices = {};
    for (const el of elements) {
      choices[el.ref] = `${el.role}: "${el.label}"`;
    }
    choices['none'] = 'Żaden element nie pasuje do intencji';

    questions['best_match'] = {
      type: 'choice',
      instructions: `Który element interaktywny najlepiej pasuje do intencji: "${intention}"?`,
      criteria: choices,
    };
  }

  // Pytanie 2: Czy strona zawiera formularz?
  questions['has_form'] = {
    type: 'noul',
    instructions: 'Czy strona zawiera formularz do wypełnienia?',
    criteria: {
      'true': 'Strona zawiera formularz z polami input/textbox',
      'false': 'Strona nie zawiera formularza',
    },
  };

  // Pytanie 3: Jaki jest typ strony?
  questions['page_type'] = {
    type: 'choice',
    instructions: 'Jaki jest typ tej strony?',
    criteria: {
      'login': 'Strona logowania',
      'registration': 'Rejestracja / tworzenie konta',
      'form': 'Formularz (kontakt, zamówienie, etc.)',
      'listing': 'Lista elementów (produkty, wyniki, etc.)',
      'detail': 'Strona szczegółowa (produkt, artykuł, profil)',
      'dashboard': 'Dashboard / panel zarządzania',
      'navigation': 'Strona nawigacyjna / landing',
      'error': 'Strona błędu (404, 500, etc.)',
      'other': 'Inny typ strony',
    },
  };

  // Pytanie 4: Dla każdego elementu — czy jest istotny dla intencji? (max 10)
  if (intention) {
    const topElements = elements.slice(0, 10);
    for (const el of topElements) {
      questions[`relevant_${el.ref}`] = {
        type: 'noul',
        instructions: `Czy element [${el.ref}] ${el.role} "${el.label}" jest istotny dla intencji: "${intention}"?`,
        criteria: {
          'true': 'Element jest bezpośrednio związany z intencją',
          'false': 'Element nie jest związany z intencją',
        },
      };
    }
  }

  return questions;
}

/**
 * Przetwórz odpowiedź JEV na czytelny format.
 *
 * @param {Object} jevData - Surowa odpowiedź z Decisions API
 * @param {Array} elements - Lista interaktywnych elementów
 * @param {string} snapshotText - Oryginalny snapshot
 * @param {string} intention - Intencja użytkownika
 * @returns {Object} Przetworzony wynik
 */
function processJevResponse(jevData, elements, snapshotText, intention) {
  const answers = jevData.answers || {};

  // Helper do wyciągania wartości z obiektów decyzji { type, choice, noul, ... }
  const extractVal = (obj) => {
    if (!obj) return null;
    if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') return obj;
    if (obj.choice !== undefined) return obj.choice;
    if (obj.noul !== undefined) return obj.noul;
    if (obj.answer !== undefined) return obj.answer;
    if (obj.score !== undefined) return obj.score;
    return obj;
  };

  const bestMatchVal = extractVal(answers.best_match);
  const pageTypeVal = extractVal(answers.page_type);
  const hasFormVal = extractVal(answers.has_form);

  // Zbuduj listę istotnych elementów
  const relevantElements = [];
  for (const el of elements) {
    const raw = answers[`relevant_${el.ref}`];
    const val = extractVal(raw);
    const score = typeof val === 'number' ? val : (raw && typeof raw.probability === 'number' ? raw.probability : 0);
    if (score >= 0.5) {
      relevantElements.push({ ...el, relevance: score });
    }
  }

  // Sortuj po istotności malejąco
  relevantElements.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));

  return {
    bestMatch: bestMatchVal,
    pageType: pageTypeVal,
    hasForm: typeof hasFormVal === 'number' ? hasFormVal >= 0.5 : Boolean(hasFormVal),
    relevantElements,
    allElements: elements,
    rawAnswers: answers,
  };
}

/**
 * Sformatuj wynik JEV do tekstu dołączanego do odpowiedzi MCP.
 *
 * @param {Object} jevResult - Wynik z processJevResponse
 * @param {string} originalText - Oryginalny tekst odpowiedzi (kod + metadane)
 * @returns {string}
 */
function formatJevResult(jevResult, originalText, compressedSnapshot = '') {
  const lines = [];

  // Zachowaj oryginalny prefix (kod Playwright, metadane strony)
  if (originalText) {
    lines.push(originalText);
    lines.push('');
  }

  lines.push('─── JEV ANALYSIS ───');
  lines.push('');

  // Typ strony
  if (jevResult.pageType) {
    lines.push(`📍 Typ strony: ${jevResult.pageType}`);
  }

  // Formularz?
  if (jevResult.hasForm !== undefined && jevResult.hasForm !== null) {
    lines.push(`📝 Formularz: ${jevResult.hasForm ? 'TAK' : 'NIE'}`);
  }

  lines.push('');

  // Best match
  if (jevResult.bestMatch) {
    const match = jevResult.bestMatch;
    if (match !== 'none') {
      const el = jevResult.allElements.find(e => e.ref === match);
      lines.push(`⭐ NAJLEPSZE DOPASOWANIE: [ref=${match}] ${el ? `${el.role}: "${el.label}"` : ''}`);
    } else {
      lines.push('⭐ Brak dopasowania do intencji');
    }
    lines.push('');
  }

  // Istotne elementy
  if (jevResult.relevantElements && jevResult.relevantElements.length > 0) {
    lines.push('🔘 ELEMENTY ISTOTNE DLA INTENCJI:');
    for (const el of jevResult.relevantElements) {
      const pct = Math.round((el.relevance || 0) * 100);
      lines.push(`  - [ref=${el.ref}] ${el.role}: "${el.label}" (${pct}%)`);
    }
    lines.push('');
  }

  // Wszystkie interaktywne elementy
  lines.push('🔘 WSZYSTKIE ELEMENTY INTERAKTYWNE:');
  for (const el of (jevResult.allElements || [])) {
    lines.push(`  - [ref=${el.ref}] ${el.role}: "${el.label}"`);
  }

  // Dołącz skompresowane drzewo jeśli przekazane
  if (compressedSnapshot) {
    lines.push('');
    lines.push('─── ACCESSIBILITY TREE (COMPRESSED) ───');
    lines.push(compressedSnapshot);
  }

  return lines.join('\n');
}

/**
 * Fallback gdy JEV niedostępny.
 */
function buildFallbackResult(snapshotText, intention) {
  const elements = extractInteractiveElements(snapshotText);
  return {
    bestMatch: null,
    pageType: null,
    hasForm: null,
    relevantElements: [],
    allElements: elements,
    rawAnswers: {},
    fallback: true,
  };
}

module.exports = {
  analyzeWithJev,
  formatJevResult,
  extractInteractiveElements,
  buildFallbackResult,
};
