// src/jev-proxy/__tests__/loop-detector.test.js
const { test, expect } = require('@playwright/test');
const { LoopDetector } = require('../loop-detector');

test.describe('LoopDetector', () => {
  test('allows steps within limit', () => {
    const detector = new LoopDetector({ maxSteps: 5 });
    for (let i = 0; i < 5; i++) {
      detector.recordStep({ pageFingerprint: `page-${i}`, action: 'click', ref: `e${i}` });
    }
    expect(detector.shouldStop()).toBe(false);
  });

  test('stops when max_steps exceeded', () => {
    const detector = new LoopDetector({ maxSteps: 3 });
    for (let i = 0; i < 4; i++) {
      detector.recordStep({ pageFingerprint: `page-${i}`, action: 'click', ref: `e${i}` });
    }
    expect(detector.shouldStop()).toBe(true);
    expect(detector.stopReason).toContain('max');
  });

  test('detects A→B→A→B cycle', () => {
    const detector = new LoopDetector({ maxSteps: 15 });
    detector.recordStep({ pageFingerprint: 'A', action: 'click', ref: 'e1' });
    detector.recordStep({ pageFingerprint: 'B', action: 'click', ref: 'e2' });
    detector.recordStep({ pageFingerprint: 'A', action: 'click', ref: 'e1' });
    detector.recordStep({ pageFingerprint: 'B', action: 'click', ref: 'e2' });

    expect(detector.shouldStop()).toBe(true);
    expect(detector.stopReason).toContain('cycle');
  });

  test('does not false-positive on A→B→C→A', () => {
    const detector = new LoopDetector({ maxSteps: 15 });
    detector.recordStep({ pageFingerprint: 'A', action: 'click', ref: 'e1' });
    detector.recordStep({ pageFingerprint: 'B', action: 'click', ref: 'e2' });
    detector.recordStep({ pageFingerprint: 'C', action: 'click', ref: 'e3' });
    detector.recordStep({ pageFingerprint: 'A', action: 'click', ref: 'e4' });

    expect(detector.shouldStop()).toBe(false);
  });

  test('generates page fingerprint from snapshot text', () => {
    const detector = new LoopDetector();
    const fp1 = detector.fingerprint('- document [ref=d1] "Page 1"\n  - button [ref=b1] "Click"');
    const fp2 = detector.fingerprint('- document [ref=d1] "Page 1"\n  - button [ref=b1] "Click"');
    const fp3 = detector.fingerprint('- document [ref=d1] "Page 2"\n  - link [ref=l1] "Other"');

    expect(fp1).toBe(fp2);
    expect(fp1).not.toBe(fp3);
  });

  test('getHistory returns step records', () => {
    const detector = new LoopDetector();
    detector.recordStep({ pageFingerprint: 'X', action: 'click', ref: 'e1' });
    const history = detector.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].pageFingerprint).toBe('X');
  });

  test('reset clears state', () => {
    const detector = new LoopDetector({ maxSteps: 3 });
    for (let i = 0; i < 4; i++) {
      detector.recordStep({ pageFingerprint: `p${i}`, action: 'click', ref: `e${i}` });
    }
    expect(detector.shouldStop()).toBe(true);
    detector.reset();
    expect(detector.shouldStop()).toBe(false);
    expect(detector.getHistory()).toHaveLength(0);
  });
});
