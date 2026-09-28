// src/jev-proxy/__tests__/bil-controller.test.js
const { test, expect } = require('@playwright/test');
const { BilController } = require('../bil-controller');

// Mock Executor — symuluje 2-krokową nawigację: homepage → login page → completed
function createMockExecutor() {
  let pageState = 'homepage';
  const snapshots = {
    homepage: `- document [ref=d1] "Shop"
  - navigation [ref=n1]
    - link [ref=e1] "Home" [url="/"]
    - link [ref=e2] "Moje konto" [url="/account"]
    - button [ref=e3] "Koszyk"
  - main [ref=m1]
    - heading [ref=h1] "Witaj w sklepie"`,
    account: `- document [ref=d1] "Logowanie"
  - main [ref=m1]
    - heading [ref=h1] "Zaloguj się"
    - textbox [ref=e10] "Email"
    - textbox [ref=e11] "Hasło"
    - button [ref=e12] "Zaloguj"`,
  };

  return {
    pageState,
    executeClick: async (ref) => {
      if (ref === 'e2') pageState = 'account';
      return { status: 'success', pageChanged: ref === 'e2' };
    },
    executeFill: async (ref, value) => {
      return { status: 'success', pageChanged: false };
    },
    executeNavigate: async (url) => {
      return { status: 'success', pageChanged: true };
    },
    executeRead: async () => {
      return snapshots[pageState] || snapshots.homepage;
    },
    getSnapshot: async () => {
      return snapshots[pageState] || snapshots.homepage;
    },
  };
}

// Mock Resolver — symuluje deterministyczne decyzje
function createMockResolver() {
  return {
    resolve: async (goal, candidates, options) => {
      // Na homepage: navigate toward goal → kliknij "Moje konto"
      const hasLogin = candidates.some(c => c.name === 'Zaloguj' || c.name === 'Zaloguj się');
      if (hasLogin) {
        const loginBtn = candidates.find(c => c.name === 'Zaloguj' || c.name === 'Zaloguj się');
        return {
          ref: loginBtn.ref,
          confidence: 0.95,
          goalState: 'executable_here',
        };
      }

      const accountLink = candidates.find(c => c.name === 'Moje konto');
      if (accountLink) {
        return {
          ref: accountLink.ref,
          confidence: 0.88,
          goalState: 'navigate_toward_goal',
        };
      }

      return { ref: null, confidence: 0.1, goalState: 'blocked' };
    },
  };
}

test.describe('BilController', () => {
  test('runs the navigation loop until executable_here', async () => {
    const executor = createMockExecutor();
    const resolver = createMockResolver();
    const controller = new BilController({ executor, resolver, maxSteps: 10 });

    const result = await controller.run({ goal: 'zaloguj użytkownika' });

    expect(result.finalState).toBe('executable_here');
    expect(result.steps).toBeGreaterThanOrEqual(1);
    expect(result.steps).toBeLessThanOrEqual(10);
  });

  test('stops at max_steps', async () => {
    const executor = createMockExecutor();
    // Resolver that always says navigate
    const resolver = {
      resolve: async (goal, candidates) => {
        const first = candidates[0];
        return { ref: first?.ref || null, confidence: 0.7, goalState: 'navigate_toward_goal' };
      },
    };
    const controller = new BilController({ executor, resolver, maxSteps: 3 });

    const result = await controller.run({ goal: 'zaloguj' });

    expect(result.stopped).toBe(true);
    expect(result.steps).toBeLessThanOrEqual(4); // maxSteps + 1 for final check
  });

  test('returns blocked when no candidates found', async () => {
    const emptyExecutor = {
      getSnapshot: async () => '- document [ref=d1] "Empty"',
      executeRead: async () => '- document [ref=d1] "Empty"',
      executeClick: async () => ({ status: 'success', pageChanged: false }),
      executeFill: async () => ({ status: 'success', pageChanged: false }),
      executeNavigate: async () => ({ status: 'success', pageChanged: false }),
    };
    const resolver = {
      resolve: async () => ({ ref: null, confidence: 0.1, goalState: 'blocked' }),
    };
    const controller = new BilController({ executor: emptyExecutor, resolver, maxSteps: 5 });

    const result = await controller.run({ goal: 'zaloguj' });

    expect(result.finalState).toBe('blocked');
  });

  test('applies confidence policy — escalates on low confidence', async () => {
    const executor = createMockExecutor();
    const resolver = {
      resolve: async () => ({ ref: 'e2', confidence: 0.4, goalState: 'navigate_toward_goal' }),
    };
    const controller = new BilController({ executor, resolver, maxSteps: 5 });

    const result = await controller.run({ goal: 'zaloguj' });

    expect(result.escalated).toBe(true);
  });
});
