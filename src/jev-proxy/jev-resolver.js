// src/jev-proxy/jev-resolver.js
'use strict';

const LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/**
 * Zbuduj prompt/state dla JEV Decisions API.
 *
 * @param {string} goal
 * @param {Array<{ ref: string, role: string, name: string }>} candidates
 * @param {string} [pageContext]
 * @returns {string}
 */
function buildResolverPrompt(goal, candidates, pageContext) {
  const lines = [];
  lines.push(`GOAL:`);
  lines.push(`"${goal}"`);
  lines.push('');
  if (pageContext) {
    lines.push(`CURRENT PAGE:`);
    lines.push(pageContext);
    lines.push('');
  }
  lines.push('OPTIONS:');
  for (let i = 0; i < candidates.length && i < LABELS.length; i++) {
    const c = candidates[i];
    const label = LABELS[i];
    candidates[i] = { ...c, label };
    const desc = c.href ? `${c.role} "${c.name}" [${c.href}]` : `${c.role} "${c.name || ''}"`;
    lines.push(`${label}: ${desc}`);
  }
  return lines.join('\n');
}

/**
 * Zbuduj pytania JEV Decisions API.
 *
 * @param {Array<{ label: string, ref: string, role: string, name: string }>} candidates
 * @param {string} goal
 * @returns {Object}
 */
function buildResolverQuestions(candidates, goal) {
  const choices = {};
  for (const c of candidates) {
    if (c.label) {
      choices[c.label] = `${c.role}: "${c.name || ''}"`;
    }
  }
  choices['none'] = 'Żaden element nie przybliża do celu';

  const questions = {
    goal_state: {
      type: 'choice',
      instructions: `Jaki jest stan celu "${goal}" na tej stronie?`,
      criteria: {
        completed: 'Cel jest już zrealizowany na tej stronie',
        executable_here: 'Cel można zrealizować bezpośrednio na tej stronie (formularz/przycisk)',
        navigate_toward_goal: 'Trzeba nawigować dalej aby dojść do celu',
        blocked: 'Nie można osiągnąć celu z tej strony',
      },
    },
    element_choice: {
      type: 'choice',
      instructions: `Która opcja najbardziej przybliża do celu: "${goal}"?`,
      criteria: choices,
    },
  };

  // Niezależne pytania noul (skala 0.0–1.0 / 0–100%) dla czołowych kandydatów (max 8)
  const topCandidates = candidates.slice(0, 8);
  for (const c of topCandidates) {
    if (c.label) {
      questions[`score_${c.label}`] = {
        type: 'noul',
        instructions: `W skali 0-1 jak bardzo opcja ${c.label} (${c.role} "${c.name || ''}") przybliża do celu "${goal}"?`,
        criteria: {
          true: 'Wysoka pewność, że to właściwy krok (1.0)',
          false: 'Nie prowadzi do celu (0.0)',
        },
      };
    }
  }

  return questions;
}

/**
 * Parsuj odpowiedź JEV na ResolverChoice.
 *
 * @param {Object} jevData - Surowa odpowiedź z Decisions API
 * @param {Array<{ ref: string, label: string }>} candidates
 * @returns {Object}
 */
function parseResolverResponse(jevData, candidates) {
  const answers = jevData.answers || {};

  // Helper
  const extractVal = (obj) => {
    if (!obj) return null;
    if (typeof obj === 'string' || typeof obj === 'number') return obj;
    if (obj.choice !== undefined) return obj.choice;
    if (obj.noul !== undefined) return obj.noul;
    return null;
  };

  const choiceLabel = extractVal(answers.element_choice);
  const goalState = extractVal(answers.goal_state) || 'blocked';

  // Zbierz niezależne oceny noul dla kandydatów (score_${label})
  const candidateScores = {};
  for (const c of candidates) {
    if (c.label && answers[`score_${c.label}`] !== undefined) {
      const score = extractVal(answers[`score_${c.label}`]);
      if (typeof score === 'number') {
        candidateScores[c.label] = score;
      }
    }
  }

  let bestLabel = choiceLabel;
  let confidence = 0.3;

  const scoreKeys = Object.keys(candidateScores);
  if (scoreKeys.length > 0) {
    // Znajdź kandydata z najwyższym niezależnym wynikiem noul
    let maxScore = -1;
    let maxLabel = null;
    for (const label of scoreKeys) {
      const s = candidateScores[label];
      if (s > maxScore) {
        maxScore = s;
        maxLabel = label;
      }
    }

    // Jeśli najwyższy noul ma solidny wynik (>= 0.50), promuj go na bestLabel
    if (maxLabel && maxScore >= 0.50) {
      bestLabel = maxLabel;
      confidence = maxScore;
    } else if (choiceLabel && candidateScores[choiceLabel] !== undefined) {
      confidence = candidateScores[choiceLabel];
    } else if (maxScore >= 0) {
      confidence = maxScore;
    }
  } else {
    // Fallback dla pojedynczego pytania confidence (np. w mockach/testach)
    const rawConfidence = extractVal(answers.confidence);
    confidence = typeof rawConfidence === 'number' ? rawConfidence : 0.3;
  }

  // Map label → ref
  let ref = null;
  if (bestLabel && bestLabel !== 'none') {
    const match = candidates.find(c => c.label === bestLabel);
    if (match) ref = match.ref;
  }

  const usage = jevData.usage ? {
    inputTokens: jevData.usage.input_tokens || 0,
    outputTokens: jevData.usage.output_tokens || 0,
    totalTokens: (jevData.usage.input_tokens || 0) + (jevData.usage.output_tokens || 0),
    cost: jevData.usage.cost || 0,
  } : null;

  return { ref, confidence, goalState, choiceLabel: bestLabel, usage, scores: candidateScores };
}

/**
 * Pełne wywołanie JEV resolver (z API call).
 *
 * @param {string} goal
 * @param {Array} candidates
 * @param {{ model: string, apiKey: string, baseUrl?: string }} jevConfig
 * @param {{ pageContext?: string }} [options]
 * @returns {Promise<Object>}
 */
async function resolveWithJev(goal, candidates, jevConfig, options = {}) {
  if (!jevConfig || !jevConfig.apiKey) {
    return { ref: null, confidence: 0, goalState: 'blocked', reason: 'No API key' };
  }

  if (!candidates || candidates.length === 0) {
    return { ref: null, confidence: 0, goalState: 'blocked', reason: 'No candidates' };
  }

  // Dodaj labele do kandydatów
  const labeled = candidates.map((c, i) => ({ ...c, label: LABELS[i] || `L${i}` }));

  const state = buildResolverPrompt(goal, labeled, options.pageContext);
  const questions = buildResolverQuestions(labeled, goal);

  try {
    const rawBaseUrl = jevConfig.baseUrl || 'https://openrouter.ai/api';
    const baseUrl = rawBaseUrl.replace(/\/v1\/?$/, '');
    const decisionsUrl = `${baseUrl}/alpha/decisions`;
    const response = await fetch(decisionsUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jevConfig.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://playwright-bil.local',
        'X-Title': 'Playwright BIL Resolver',
      },
      body: JSON.stringify({
        model: jevConfig.model,
        state,
        questions,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown');
      return { ref: null, confidence: 0, goalState: 'blocked', reason: `API ${response.status}: ${errorText}` };
    }

    const data = await response.json();
    return parseResolverResponse(data, labeled);
  } catch (error) {
    return { ref: null, confidence: 0, goalState: 'blocked', reason: error.message };
  }
}

module.exports = {
  buildResolverPrompt,
  buildResolverQuestions,
  parseResolverResponse,
  resolveWithJev,
};
