# Browser Intent Layer (BIL) + JEV Proxy for Playwright MCP

> **Semantyczny wrapper nad Playwright MCP z modelem JEV (Decisions API).**  
> Główny LLM nie widzi i nie analizuje gigantycznych drzew DOM/A11y — wysyła wyłącznie semantyczny cel (`browser_goal`), a silnik BIL autonomicznie podejmuje decyzje, filtruje kandydatów i steruje przeglądarką.

---

## 🚀 Wyniki Benchmarków i Uzyski (BIL vs Vanilla Playwright MCP)

Przetestowano na żywych portalach e-commerce i serwisach transakcyjnych (w tym **Orange.pl** – wieloetapowy proces dodania iPhone'a z abonamentem):

| Metryka | Vanilla Playwright MCP (Classic) | Browser Intent Layer (BIL + JEV) | Zysk / Różnica |
| :--- | :--- | :--- | :--- |
| **Tokeny do głównego LLM** | **~10 015 – 60 000+ tokenów** | **~160 – 250 tokenów** | **98.0% – 98.4% redukcji tokenów!** 🚀 |
| **Zanieczyszczenie kontekstu** | 36 KB – 73 KB surowego drzewa DOM na krok | **0 KB** (ukryte przed głównym modelem) | Brak halucynacji i utraty kontekstu |
| **Koszt per sesja** | $0.15 – $0.50 (modele Claude 3.5 Sonnet / GPT-4o) | **$0.00007 – $0.0004** (lokalne JEV Decisions API) | **Kilkaset razy niższy koszt** |
| **Autonomia nawigacji** | 0 kroków (LLM steruje każdym kliknięciem) | **Do 15 kroków autonomicznie** w pętli | Szybkie wykonanie wielokrokowe |
| **Bezpieczeństwo** | Klikanie na oślep przy halucynacji | **Safety Escalation Policy** | Eskalacja przy niskiej pewności (< 0.60) |
| **Obsługa RODO / Cookies** | Zawieszenie na nakładkach wskaźnika | **Automatyczny Consent Bypass** | Natychmiastowe klikanie przez Didomi/OneTrust |

---

## ⚙️ Wymagania i Konfiguracja

### 1. Wymagania:
* Node.js >= 18
* Klucz API [OpenRouter](https://openrouter.ai/) z dostępem do modelu Decisions API (domyślnie `typesafe/jev-1.13`)

### 2. Konfiguracja środowiska:
Skopiuj plik `.env.example` do `.env`:
```bash
cp .env.example .env
```
Wypełnij klucz API w pliku `.env`:
```env
JEV_API_KEY=sk-or-v1-twoj_klucz_openrouter
JEV_MODEL=typesafe/jev-1.13
JEV_BASE_URL=https://openrouter.ai/api
INTENT_ONLY=true
```

---

## 🛠️ Jak Uruchomić?

### Opcja 1: Uruchomienie jako serwer MCP w klientach (Cursor, VS Code, Claude Desktop, Antigravity)

W konfiguracji klienta MCP (`mcp.json` / `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "playwright-jev": {
      "command": "node",
      "args": [
        "c:/workspace/playwright/src/jev-proxy/cli.js",
        "--headless"
      ],
      "env": {
        "JEV_API_KEY": "sk-or-v1-twoj_klucz_openrouter"
      }
    }
  }
}
```

### Opcja 2: Uruchomienie z linii poleceń (CLI)

```bash
# Uruchomienie w trybie z oknem przeglądarki (headed)
node src/jev-proxy/cli.js

# Uruchomienie w trybie bezgłowym (headless)
node src/jev-proxy/cli.js --headless

# Uruchomienie z jawnym kluczem i modelem
node src/jev-proxy/cli.js --headless --jev-api-key sk-or-v1-... --jev-model typesafe/jev-1.13
```

---

## 📋 Dostępne Opcje i Flagi CLI

| Flaga CLI | Zmienna `.env` | Domyślnie | Opis |
| :--- | :--- | :--- | :--- |
| `--headless` | — | `false` (headed) | Uruchamia przeglądarkę Chromium w tle |
| `--intent-only` | `INTENT_ONLY` | `true` | **Tryb semantyczny** — ukrywa przed głównym LLM narzędzia niskopoziomowe DOM, eksponując tylko narzędzia intencji |
| `--full-tools` | — | `false` | Wyłącza `intent-only` i odsłania wszystkie 20+ narzędzi Playwright MCP |
| `--jev-api-key <key>` | `JEV_API_KEY` | `""` | Klucz API do OpenRouter Decisions API |
| `--jev-model <model>` | `JEV_MODEL` | `typesafe/jev-1.13` | Identyfikator modelu decyzyjnego |
| `--jev-base-url <url>` | `JEV_BASE_URL` | `https://openrouter.ai/api` | Adres bazowy OpenRouter API |
| `--timeout-action <ms>` | — | `25000` | Timeout akcji kliknięć w ms (odporność na ciężkie portale) |
| `--port <port>` | — | — | Port do nasłuchiwania w trybie SSE |

---

## 🧰 Jakie Narzędzia Eksponuje JEV Proxy?

Domyślnie w trybie **Intent-Only Mode** zewnętrzny klient LLM widzi tylko **7 zwięzłych narzędzi**:

1. **`browser_goal`** — Główne narzędzie semantyczne. Przyjmuje intencję użytkownika (`{ "goal": "dodaj do koszyka iphone..." }`), po czym autonomicznie wykonuje pętlę decyzyjną.
2. **`jev_set_context`** — Ustawienie kontekstu biznesowego / intencji pomocniczej.
3. **`browser_navigate`** — Otwarcie wskazanego adresu URL.
4. **`browser_navigate_back`** — Powrót do poprzedniej strony.
5. **`browser_take_screenshot`** — Wykonanie zrzutu ekranu w razie potrzeby weryfikacji wizualnej.
6. **`browser_tabs`** — Zarządzanie kartami przeglądarki (list, switch, close).
7. **`browser_close`** — Bezpieczne zamknięcie sesji przeglądarki.

> 💡 **Dlaczego ukryliśmy narzędzia DOM (`browser_click`, `browser_fill_form`, `browser_snapshot`)?**  
> W klasycznym MCP definicje tych 20 narzędzi zajmują ponad **2 500 tokenów** w promptcie systemowym klienta przy *każdym* zapytaniu, a dodatkowo zachęcają model do mikrozarządzania selektorami i halucynowania refów. Ukrycie ich wymusza czystą orkiestrację semantyczną.

---

## 🏁 Uruchamianie Benchmarków

W projekcie zaimplementowano pełny framework porównawczy mierzący zużycie tokenów, czas, liczbę kroków i koszty API:

```bash
# 1. Uruchomienie benchmarku porównawczego (BIL vs Classic) dla wszystkich scenariuszy
npm run bil:benchmark:both

# 2. Uruchomienie benchmarku na żywym portalu Orange.pl (iPhone + abonament)
npm run bil:benchmark:orange

# 3. Uruchomienie tylko silnika BIL
npm run bil:benchmark

# 4. Uruchomienie tylko silnika Classic Playwright MCP
npm run bil:benchmark:classic

# 5. Uruchomienie testów jednostkowych (55 testów, 100% pass)
npm run bil:test
```

### Dostępne scenariusze w benchmarku:
* `simple-search` (Easy) — proste wyszukanie w Google / DuckDuckGo.
* `ecommerce-cart` (Medium) — znalezienie produktu i dodanie do koszyka.
* `login-flow` (Medium) — przejście do formularza i wypełnienie danych logowania.
* `multi-step-form` (Hard) — formularz wieloetapowy.
* **`orange-iphone-cart` (Real-World Hard)** — portal Orange Polska: wybór telefonu iPhone, przejście przez ofertę abonamentową i konfigurator zamówienia.

---

## 🏛️ Architektura Browser Intent Layer

```
┌─────────────────────────────────────────────────────────────┐
│                    Główny LLM (Orchestrator)                │
└──────────────────────────────┬──────────────────────────────┘
                               │ { goal: "kup iphone..." } (~160 tok)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│              Browser Intent Layer (Proxy Server)            │
│                                                             │
│  1. Snapshot Adapter     → wyciąga drzewo dostępności       │
│  2. Normalizer           → czyści i deduplikuje elementy    │
│  3. Stop-Words Filter    → usuwa polskie/angielskie szumy   │
│  4. Candidate Retriever  → wybiera top kandydatów           │
│  5. JEV Resolver         → model 'noul' (skala 0–100%)      │
│  6. Loop Detector        → wykrywa cykle i pętle            │
│  7. Playwright Executor  → wykonuje akcje i obsługuje timeout│
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             Playwright MCP Child + Przeglądarka             │
│  • Consent Bypass Script (Didomi / OneTrust auto-bypass)    │
│  • 25 000 ms Action Timeout                                 │
└─────────────────────────────────────────────────────────────┘
```

### Kluczowe komponenty:
* **[candidate-retriever.js](file:///c:/workspace/playwright/src/jev-proxy/candidate-retriever.js):** ranking semantyczny z filtrowaniem słów stopu (nie faworyzuje słów posiłkowych „do”, „na”, „z”).
* **[jev-resolver.js](file:///c:/workspace/playwright/src/jev-proxy/jev-resolver.js):** niezależna ewaluacja kandydatów w skali 0.0–1.0 (`noul`) eliminująca sztuczne dzielenie puli 100%.
* **[consent-bypass.js](file:///c:/workspace/playwright/src/jev-proxy/consent-bypass.js):** automatyczne unieszkodliwianie nakładek cookies/RODO, które blokują klikanie w elementach (pointer events).
* **[loop-detector.js](file:///c:/workspace/playwright/src/jev-proxy/loop-detector.js):** ochrona przed zapętleniem (fingerprint stron i historia akcji).
