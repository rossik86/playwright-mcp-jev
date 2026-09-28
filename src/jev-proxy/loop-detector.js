// src/jev-proxy/loop-detector.js
'use strict';

const crypto = require('crypto');

const DEFAULT_MAX_STEPS = 15;

class LoopDetector {
  /**
   * @param {{ maxSteps?: number }} [options]
   */
  constructor(options = {}) {
    this.maxSteps = options.maxSteps || DEFAULT_MAX_STEPS;
    /** @type {Array<Object>} */
    this.history = [];
    this.stopReason = null;
  }

  /**
   * Record a step in the navigation history.
   * @param {{ pageFingerprint: string, action: string, ref?: string, target?: string }} step
   */
  recordStep(step) {
    this.history.push({
      ...step,
      timestamp: Date.now(),
    });
  }

  /**
   * Check if the loop should be stopped.
   * @returns {boolean}
   */
  shouldStop() {
    // 1. Max steps
    if (this.history.length > this.maxSteps) {
      this.stopReason = `max_steps exceeded (${this.history.length}/${this.maxSteps})`;
      return true;
    }

    // 2. Cycle detection: A→B→A→B (last 4 fingerprints form repeating pair)
    if (this.history.length >= 4) {
      const last4 = this.history.slice(-4);
      const fp = last4.map(s => `${s.pageFingerprint}:${s.action}:${s.ref || ''}`);
      if (fp[0] === fp[2] && fp[1] === fp[3]) {
        this.stopReason = `cycle detected: ${fp[0]} ↔ ${fp[1]}`;
        return true;
      }
    }

    return false;
  }

  /**
   * Generate a fingerprint from snapshot text.
   * Uses hash of text content.
   * @param {string} snapshotText
   * @returns {string}
   */
  fingerprint(snapshotText) {
    if (!snapshotText) return 'empty';
    return crypto.createHash('md5').update(snapshotText).digest('hex').slice(0, 12);
  }

  /**
   * @returns {Array<Object>}
   */
  getHistory() {
    return [...this.history];
  }

  reset() {
    this.history = [];
    this.stopReason = null;
  }
}

module.exports = { LoopDetector };
