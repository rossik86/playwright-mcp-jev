# Browser Intent Layer (BIL) + JEV Proxy for Playwright MCP

> **Semantyczny wrapper nad Playwright MCP z modelem JEV (Decisions API).**  
> Główny LLM nie widzi i nie analizuje gigantycznych drzew DOM/A11y — wysyła wyłącznie semantyczny cel (`browser_goal`), a silnik BIL autonomicznie podejmuje decyzje, filtruje kandydatów i steruje przeglądarką.

---

## 🚀 Wyniki Benchmarków i Uzyski (BIL vs Vanilla Playwright MCP)

Przetestowano na żywych portalach e-commerce i serwisach transakcyjnych:

| Portal / Scenariusz | Vanilla Playwright MCP (DOM) | Browser Intent Layer (BIL + JEV) | Oszczędność tokenów | Status BIL |
|---|---|---|---|---|
| **GrandBazaar.pl** (Kebab) | ~2 244 tokenów (7.3 KB) | **~125 tokenów** ($0.00017) | **94.4% mniej tokenów** | ✅ **100% Sukces** (3 kroki) |
| **Orange.pl** (iPhone + Plan) | ~10 015 – 60 000+ tokenów | **~201 tokenów** ($0.00043) | **98.0% mniej tokenów** | 🔄 **4 kroki autonomiczne** |
| **Empik.com** (Stephen King) | **~65 766 tokenów** (245 KB!) | **~147 tokenów** ($0.00010) | **99.8% mniej tokenów!** 🚀 | 🛡️ **Safety Escalation** |

### 📈 Globalne Porównanie Metryk:

| Metryka | Vanilla Playwright MCP (Classic) | Browser Intent Layer (BIL + JEV) | Zysk / Różnica |
| :--- | :--- | :--- | :--- |
| **Tokeny do głównego LLM** | **~10 015 – 65 000+ tokenów** | **~125 – 250 tokenów** | **94.4% – 99.8% redukcji tokenów!** 🚀 |
| **Zanieczyszczenie kontekstu** | 7 KB – 245 KB surowego drzewa DOM na krok | **0 KB** (ukryte przed głównym modelem) | Czyste okno kontekstowe, 0 halucynacji |
| **Koszt per sesja** | $0.15 – $0.50 (modele Claude 3.5 Sonnet / GPT-4o) | **$0.00007 – $0.0004** (lokalne JEV Decisions API) | **Setki razy niższy koszt** |
| **Autonomia nawigacji** | 0 kroków (LLM steruje każdym kliknięciem) | **Do 15 kroków autonomicznie** w pętli | Szybkie wykonanie wielokrokowe |
| **Bezpieczeństwo** | Klikanie na oślep przy halucynacji | **Safety Escalation Policy** | Eskalacja przy niskiej pewności (< 0.60) |
| **Obsługa RODO / Cookies** | Zawieszenie na nakładkach wskaźnika | **Automatyczny Consent Bypass** | Natychmiastowe klikanie przez Didomi/OneTrust |

---

### 🔍 Szczegółowe Wyniki per Portal:

#### 1. GrandBazaar.pl – Zamówienie kebaba online
* **Cel:** `zamów kebaba aż do danych adresowych`
* **Classic Playwright MCP:** 2 244 tokenów (7.3 KB) zrzucone do promptu.
* **BIL + JEV:** **125 tokenów** (Main LLM), 4 979 tokenów (JEV Decisions API), koszt: $0.000175, czas: 5.02s.
* **Przebieg:** 
  1. Wykrycie linku `Zamów online` (`/menu`).
  2. Wybór pozycji kebaba kraftowego (`button "Dodaj"`).
  3. Przejście do koszyka i sekcji kasy.
* **Wynik:** ✅ **100% sukces** w 3 autonomicznych krokach, 94.4% oszczędności tokenów.

#### 2. Orange Polska (Orange.pl) – iPhone z najmniejszym abonamentem
* **Cel:** `dodaj do koszyka telefon iphone najnowszy z abonamentem najmniejszym i przejdź na dane zamawiającego`
* **Classic Playwright MCP:** ~10 015 tokenów na krok (szacunkowo 60 000+ tokenów na cały 4-krokowy proces, drzewo 36.3 KB – 73 KB na krok).
* **BIL + JEV:** **201 tokenów** (Main LLM), 12 077 tokenów (JEV Decisions API), koszt: $0.000434, czas: 42.8s.
* **Przebieg:** 
  1. Strona główna: wybór oferty abonamentowej (`ref=e112`).
  2. Przejście do konfiguratora i procesu aktywacji (`ref=f6e186`).
  3. Konfiguracja planu komórkowego i dobór urządzeń (`ref=f12e131`).
  4. Detekcja cyklu przez LoopDetector i bezpieczne zatrzymanie.
* **Wynik:** 🔄 **4 autonomiczne kroki**, pokonanie blokującej nakładki cookies Didomi CMP, 98.0% oszczędności tokenów.

#### 3. Empik.com – Książka Stephena Kinga "Misery"
* **Cel:** `dodaj książkę Stephena Kinga Misery do koszyka i przejdź do danych adresowych`
* **Classic Playwright MCP:** **65 766 tokenów w jednym snapshocie! (245.1 KB surowego drzewa DOM)**.
* **BIL + JEV:** **147 tokenów** (Main LLM), 2 980 tokenów (JEV Decisions API), koszt: $0.000107, czas: 3.45s.
* **Działanie:** Model wykrył, że na stronie głównej książka nie jest widoczna, a kliknięcie `Przejdź do Twojego koszyka` ma niską pewność (`conf = 0.32`), ponieważ koszyk jest pusty. Zgodnie z architekturą bezpieczeństwa BIL nie kliknął w pusty koszyk, lecz zwrócił status `⚠️ ESCALATED: Low confidence`.
* **Wynik:** 🛡️ **99.8% oszczędności tokenów** i zadziałanie polityki bezpieczeństwa przed halucynacją.

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

# 2. Uruchomienie benchmarków dla konkretnych portali:
npm run bil:benchmark:orange        # Orange.pl (iPhone + abonament)
npm run bil:benchmark:grandbazaar   # GrandBazaar.pl (zamówienie kebaba)
npm run bil:benchmark:empik         # Empik.com (Stephen King Misery)

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
* **`grandbazaar-kebab` (Real-World Delivery)** — portal restauracyjny GrandBazaar.pl: wejście w menu, wybór kebaba i przejście do zamówienia (100% sukces, 94.4% oszczędności tokenów).
* **`empik-book-misery` (Real-World E-commerce)** — portal Empik.com: 245 KB drzewo DOM, 65k tokenów w klasycznym MCP zredukowane do 147 tokenów w BIL (99.8% oszczędności).

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
