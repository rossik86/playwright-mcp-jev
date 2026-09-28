// src/jev-proxy/types.js
'use strict';

/**
 * @typedef {'click' | 'fill' | 'read' | 'navigate'} ActionType
 */

/**
 * @typedef {Object} BrowserAction
 * @property {ActionType} type
 * @property {string} [target] - Semantyczny opis celu (np. "przycisk Zaloguj")
 * @property {string} [value] - Wartość do wpisania (tylko dla fill)
 * @property {string} [url] - URL do nawigacji (tylko dla navigate)
 */

/**
 * @typedef {Object} BrowserGoal
 * @property {string} goal - Semantyczny cel (np. "zaloguj użytkownika")
 */

/**
 * @typedef {'completed' | 'executable_here' | 'navigate_toward_goal' | 'blocked'} GoalState
 */

/**
 * @typedef {Object} GoalClassification
 * @property {GoalState} state
 * @property {number} confidence - 0.0–1.0
 * @property {string} [reason] - Opcjonalny opis decyzji
 */

/**
 * @typedef {Object} ResolverChoice
 * @property {string} ref - Ref wybranego elementu
 * @property {number} confidence - 0.0–1.0
 * @property {GoalState} goalState
 * @property {string} [reason]
 */

/**
 * @typedef {Object} NormalizedElement
 * @property {string} ref
 * @property {string} role
 * @property {string} name - Tekst/label elementu
 * @property {string} [href] - Opcjonalny URL (dla linków)
 * @property {string} [parent] - Nazwa/rola rodzica
 * @property {boolean} [disabled]
 */

/**
 * @typedef {Object} ActionFeedback
 * @property {'success' | 'error'} status
 * @property {boolean} pageChanged
 * @property {string} [error]
 */

/**
 * @typedef {Object} StepRecord
 * @property {string} pageFingerprint
 * @property {string} action - np. "click"
 * @property {string} [ref]
 * @property {string} [target]
 * @property {number} timestamp
 */

const VALID_ACTION_TYPES = new Set(['click', 'fill', 'read', 'navigate']);
const VALID_GOAL_STATES = new Set(['completed', 'executable_here', 'navigate_toward_goal', 'blocked']);

/**
 * Waliduj BrowserAction.
 * @param {*} action
 * @returns {{ valid: boolean, error?: string }}
 */
function validateAction(action) {
  if (!action || typeof action !== 'object') return { valid: false, error: 'Action must be an object' };
  if (!VALID_ACTION_TYPES.has(action.type)) return { valid: false, error: `Invalid action type: ${action.type}` };
  if (action.type === 'navigate' && !action.url) return { valid: false, error: 'navigate requires url' };
  if (action.type === 'fill' && !action.value) return { valid: false, error: 'fill requires value' };
  if ((action.type === 'click' || action.type === 'fill' || action.type === 'read') && !action.target) {
    return { valid: false, error: `${action.type} requires target` };
  }
  return { valid: true };
}

/**
 * Waliduj BrowserGoal.
 * @param {*} goal
 * @returns {{ valid: boolean, error?: string }}
 */
function validateGoal(goal) {
  if (!goal || typeof goal !== 'object') return { valid: false, error: 'Goal must be an object' };
  if (!goal.goal || typeof goal.goal !== 'string') return { valid: false, error: 'Goal must have a string "goal" property' };
  return { valid: true };
}

module.exports = {
  VALID_ACTION_TYPES,
  VALID_GOAL_STATES,
  validateAction,
  validateGoal,
};
