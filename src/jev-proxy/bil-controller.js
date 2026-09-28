// src/jev-proxy/bil-controller.js
'use strict';

const { normalizeSnapshot } = require('./normalizer');
const { retrieveCandidates } = require('./candidate-retriever');
const { LoopDetector } = require('./loop-detector');
const { extractSnapshot } = require('./snapshot-compressor');

/**
 * Confidence thresholds.
 */
const CONFIDENCE = {
  HIGH: 0.85,
  MEDIUM: 0.60,
};

/**
 * BIL Controller — serce Browser Intent Layer.
 *
 * Pętla:
 * 1. inspect page (snapshot)
 * 2. normalize → retrieve candidates
 * 3. classify state via resolver (JEV)
 * 4. act based on goalState + confidence
 * 5. repeat
 */
class BilController {
  /**
   * @param {{
   *   executor: any,
   *   resolver: { resolve(goal: string, candidates: Array<any>, options?: any): Promise<any> },
   *   maxSteps?: number,
   * }} config
   */
  constructor(config) {
    this.executor = config.executor;
    this.resolver = config.resolver;
    this.loopDetector = new LoopDetector({ maxSteps: config.maxSteps || 15 });
  }

  /**
   * Uruchom pętlę nawigacyjną.
   *
   * @param {{ goal: string }} browserGoal
   * @returns {Promise<{
   *   finalState: string,
   *   steps: number,
   *   escalated: boolean,
   *   stopped: boolean,
   *   stopReason: string|null,
   *   log: Array<any>
   * }>}
   */
  async run(browserGoal) {
    const goal = browserGoal.goal;
    let steps = 0;
    let finalState = 'blocked';
    let escalated = false;
    let stopped = false;
    const log = [];

    while (true) {
      // 1. Inspect page
      const rawSnapshot = await this.executor.getSnapshot();
      const { snapshot } = extractSnapshot(rawSnapshot);
      const snapshotText = snapshot || rawSnapshot;

      // 2. Fingerprint + loop check
      const fingerprint = this.loopDetector.fingerprint(snapshotText);

      // 3. Normalize
      const elements = normalizeSnapshot(snapshotText);

      // 4. Retrieve candidates
      const candidates = retrieveCandidates(elements, { goal });

      // 5. Resolve via JEV
      let choice;
      if (candidates.length === 0) {
        choice = { ref: null, confidence: 0, goalState: 'blocked' };
      } else {
        choice = await this.resolver.resolve(goal, candidates, { pageContext: fingerprint });
      }

      steps++;

      // Record step
      this.loopDetector.recordStep({
        pageFingerprint: fingerprint,
        action: choice.goalState,
        ref: choice.ref,
      });

      log.push({
        step: steps,
        fingerprint,
        goalState: choice.goalState,
        ref: choice.ref,
        confidence: choice.confidence,
        candidateCount: candidates.length,
      });

      // 6. Check goalState
      if (choice.goalState === 'completed') {
        finalState = 'completed';
        break;
      }

      if (choice.goalState === 'blocked') {
        finalState = 'blocked';
        break;
      }

      // 7. Confidence policy
      if (choice.confidence < CONFIDENCE.MEDIUM) {
        // Escalate to main LLM
        finalState = choice.goalState;
        escalated = true;
        break;
      }

      // 8. Loop protection
      if (this.loopDetector.shouldStop()) {
        finalState = choice.goalState;
        stopped = true;
        break;
      }

      // 9. Execute action
      if (choice.goalState === 'executable_here') {
        if (choice.ref) {
          await this.executor.executeClick(choice.ref);
        }
        finalState = 'executable_here';
        break;
      }

      if (choice.goalState === 'navigate_toward_goal') {
        if (choice.ref) {
          const feedback = await this.executor.executeClick(choice.ref);
          if (feedback && feedback.status === 'error') {
            finalState = 'blocked';
            break;
          }
        } else {
          finalState = 'blocked';
          break;
        }
        // Continue loop
      }
    }

    return {
      finalState,
      steps,
      escalated,
      stopped,
      stopReason: this.loopDetector.stopReason,
      log,
    };
  }
}

module.exports = { BilController, CONFIDENCE };
