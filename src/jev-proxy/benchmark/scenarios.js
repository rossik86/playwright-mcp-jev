// src/jev-proxy/benchmark/scenarios.js
'use strict';

/**
 * Scenariusze testowe dla benchmarku BIL vs Playwright MCP.
 *
 * Każdy scenariusz to:
 * - name: identyfikator
 * - url: strona startowa
 * - goal: cel semantyczny
 * - expectedSteps: maksymalna oczekiwana liczba kroków
 * - validation: funkcja walidująca sukces (opcjonalna)
 * - difficulty: easy | medium | hard
 */
const SCENARIOS = [
  // === EASY: Login widoczny na homepage ===
  {
    name: 'login-visible-homepage',
    url: 'https://practicetestautomation.com/practice-test-login/',
    goal: 'zaloguj użytkownika (user: student, hasło: Password123)',
    expectedSteps: 3,
    difficulty: 'easy',
  },
  {
    name: 'simple-search',
    url: 'https://www.google.com',
    goal: 'wyszukaj "playwright mcp"',
    expectedSteps: 2,
    difficulty: 'easy',
  },
  {
    name: 'accept-cookies',
    url: 'https://www.wikipedia.org',
    goal: 'zaakceptuj cookies jeśli jest banner',
    expectedSteps: 2,
    difficulty: 'easy',
  },
  {
    name: 'navigate-to-link',
    url: 'https://www.wikipedia.org',
    goal: 'przejdź do angielskiej wersji Wikipedia',
    expectedSteps: 2,
    difficulty: 'easy',
  },
  {
    name: 'read-heading',
    url: 'https://example.com',
    goal: 'odczytaj tytuł strony',
    expectedSteps: 1,
    difficulty: 'easy',
  },

  // === MEDIUM: Nawigacja wieloetapowa ===
  {
    name: 'login-via-menu',
    url: 'https://the-internet.herokuapp.com/',
    goal: 'zaloguj się (user: tomsmith, hasło: SuperSecretPassword!)',
    expectedSteps: 5,
    difficulty: 'medium',
  },
  {
    name: 'find-form',
    url: 'https://the-internet.herokuapp.com/',
    goal: 'wypełnij formularz kontaktowy',
    expectedSteps: 5,
    difficulty: 'medium',
  },
  {
    name: 'navigate-dropdown',
    url: 'https://the-internet.herokuapp.com/',
    goal: 'wybierz opcję z dropdown',
    expectedSteps: 4,
    difficulty: 'medium',
  },
  {
    name: 'handle-alert',
    url: 'https://the-internet.herokuapp.com/',
    goal: 'wywołaj i zaakceptuj alert JavaScript',
    expectedSteps: 4,
    difficulty: 'medium',
  },
  {
    name: 'checkbox-toggle',
    url: 'https://the-internet.herokuapp.com/',
    goal: 'zaznacz checkbox',
    expectedSteps: 3,
    difficulty: 'medium',
  },

  // === HARD: Wieloetapowe scenariusze ===
  {
    name: 'multi-step-login-menu',
    url: 'https://demoqa.com/',
    goal: 'przejdź do formularza i wypełnij pola (imię: Jan, nazwisko: Kowalski, email: jan@test.com)',
    expectedSteps: 8,
    difficulty: 'hard',
  },
  {
    name: 'product-search',
    url: 'https://www.saucedemo.com/',
    goal: 'zaloguj się (user: standard_user, pass: secret_sauce) i dodaj pierwszy produkt do koszyka',
    expectedSteps: 6,
    difficulty: 'hard',
  },

  // === REAL-WORLD E-COMMERCE: Orange.pl ===
  {
    name: 'orange-iphone-cart',
    url: 'https://www.orange.pl',
    goal: 'dodaj do koszyka telefon iphone najnowszy z abonamentem najmniejszym i przejdź na dane zamawiającego',
    expectedSteps: 15,
    difficulty: 'hard',
  },

  // === REAL-WORLD RESTAURANT / DELIVERY: GrandBazaar.pl ===
  {
    name: 'grandbazaar-kebab',
    url: 'https://www.grandbazaar.pl/',
    goal: 'zamów kebaba aż do danych adresowych',
    expectedSteps: 8,
    difficulty: 'hard',
  },

  // === REAL-WORLD E-COMMERCE: Empik.com ===
  {
    name: 'empik-book-misery',
    url: 'https://www.empik.com/',
    goal: 'dodaj książkę Stephena Kinga Misery do koszyka i przejdź do danych adresowych',
    expectedSteps: 10,
    difficulty: 'hard',
  },
];

module.exports = { SCENARIOS };
