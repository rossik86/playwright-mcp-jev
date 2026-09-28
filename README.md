# Playwright MCP + JEV (Browser Intent Layer)

> **Semantyczny wrapper nad Playwright MCP z autonomicznym modelem decyzyjnym JEV (Decisions API).**  
> Redukuje zużycie tokenów w kontekście głównego LLM o **94% – 99.8%**, ukrywa niskopoziomowe drzewo DOM i pozwala na autonomiczną nawigację w stronę celu biznesowego.

---

## 📑 Spis Treści
1. [Jak to działa?](#-jak-to-działa)
2. [Architektura Systemu](#-architektura-systemu)
3. [Narzędzia MCP (Intent-Only Mode)](#-narzędzia-mcp-intent-only-mode)
4. [Jak Odpalić? (Instalacja i Konfiguracja)](#-jak-odpalić)
5. [Opcje i Flagi Uruchomieniowe](#-opcje-i-flagi-uruchomieniowe)
6. [Wyniki Benchmarków na Żywych Portalach](#-wyniki-benchmarków-na-żywych-portalach)
7. [Uruchamianie Benchmarków i Testów](#-uruchamianie-benchmarków-i-testów)

---

## 💡 Jak to działa?

### Problem z klasycznym Playwright MCP:
Tradycyjne integracje MCP z przeglądarką zrzucają całe drzewo dostępności (DOM/A11y) bezpośrednio do promptu głównego LLM przy **każdym pojedynczym kroku**:
* Na portalach takich jak Orange.pl czy Empik.com pojedynczy snapshot ma od **36 KB do aż 245 KB (ponad 65 000 tokenów!)**.
* Kilkukrokowa sesja potrafi zużyć **100 000 – 200 000 tokenów**, kosztując kilkadziesiąt centów i błyskawicznie zapychając okno kontekstowe modelu.
* Ponadto klasyczny MCP eksponuje ponad 20 niskopoziomowych narzędzi mikrozarządzania (`browser_click`, `browser_fill_form`, `browser_snapshot`), których same opisy w promptcie systemowym zajmują ponad **2 500 tokenów** i prowokują halucynacje refów selektorów.

### Rozwiązanie: Browser Intent Layer (BIL + JEV):
1. **Główny LLM staje się czystym orkiestratorem** — wysyła wyłącznie zwięzłą intencję:
   ```json
   { "goal": "dodaj do koszyka telefon iphone najnowszy z abonamentem najmniejszym i przejdź na dane zamawiającego" }
   ```
2. **Drzewo DOM nigdy nie trafia do głównego LLM** — zużycie tokenów orchestratora spada z ~65 000 do **zaledwie ~150 tokenów** (98–99.8% oszczędności).
3. **Lokalny model decyzyjny JEV (Decisions API)** — tani, wyspecjalizowany model micro-decyzji analizuje kandydatów i ocenia ich przydatność w skali 0–100% (`noul`), kosztując ułamki promila grosza per krok.
4. **Wbudowana autonomia i bezpieczeństwo**:
   * **Automatyczny Consent Bypass** neutralizuje blokujące nakładki RODO/cookies (Didomi, OneTrust, CookieBot).
   * **LoopDetector** chroni przed wpadnięciem w pętle decyzyjne.
   * **Safety Escalation Policy** eskaluje do głównego LLM tylko wtedy, gdy pewność wyboru spadnie poniżej progu bezpieczeństwa (< 0.60).

---

## 🏛️ Architektura Systemu

```
┌─────────────────────────────────────────────────────────────┐
│                    Główny LLM (Orchestrator)                │
│            Claude 3.5 Sonnet / GPT-4o / Gemini Pro          │
└──────────────────────────────┬──────────────────────────────┘
                               │  { goal: "..." } (~150 tokenów)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             BROWSER INTENT LAYER (JEV Proxy Server)         │
│                                                             │
│  1. Snapshot Adapter     → pobiera drzewo A11y              │
│  2. Normalizer           → kompresuje i deduplikuje elementy│
│  3. Stop-Words Filter    → eliminuje szum językowy (PL/EN)  │
│  4. Candidate Retriever  → wyłuskuje top 30 kandydatów      │
│  5. JEV Resolver         → model 'noul' (skala 0.0–1.0)     │
│  6. Loop Detector        → wykrywa cykle i limity kroków    │
│  7. Playwright Executor  → zarządza akcjami w Playwright    │
└──────────────────────────────┬──────────────────────────────┘
                               │  Wewnętrzne JSON-RPC (ref / target)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│              Playwright MCP Child + Przeglądarka            │
│                                                             │
│  • Consent Bypass Script (Didomi / OneTrust auto-bypass)    │
│  • 25 000 ms Action Timeout (odporność na ciężkie portale)  │
│  • Silnik Chromium (Headed lub Headless)                    │
└─────────────────────────────────────────────────────────────┘
```

### Kluczowe komponenty (`src/jev-proxy/`):
* **`bil-controller.js`** — serce pętli decyzyjnej: pobranie snapshotu ➡️ normalizacja ➡️ wybór kandydatów ➡️ rezolucja JEV ➡️ wykonanie akcji lub eskalacja.
* **`jev-resolver.js`** — integracja z OpenRouter Decisions API z niezależnym ocenianiem prawdopodobieństwa w skali 0–100% (`noul`).
* **`candidate-retriever.js`** — leksykalno-semantyczny filtr kandydatów z mechanizmem eliminacji słów posiłkowych (stop-words).
* **`consent-bypass.js`** — wstrzykiwany do przeglądarki skrypt neutralizujący nakładki cookies/RODO przechwytujące zdarzenia wskaźnika myszy.
* **`loop-detector.js`** — detektor cykli oparty na hashowaniu stanu stron (fingerprinting).
* **`playwright-executor.js`** — jedyny moduł w systemie znający selektory i refy, odpowiedzialny za klikanie, wypełnianie formularzy i obsługę timeoutów.

---

## 🧰 Narzędzia MCP (Intent-Only Mode)

Domyślnie serwer działa w trybie **Intent-Only Mode**, eksponując dla zewnętrznego klienta wyłącznie **7 narzędzi semantycznych**:

| Narzędzie | Typ | Opis |
| :--- | :--- | :--- |
| **`browser_goal`** | Semantyczne | **Główne narzędzie.** Przyjmuje intencję użytkownika (`{ "goal": "..." }`) i autonomicznie prowadzi przeglądarkę do celu. |
| **`jev_set_context`** | Kontekst | Ustawienie biznesowego kontekstu sesji (intencji pomocniczej). |
| **`browser_navigate`** | Nawigacja | Bezpośrednie przejście pod podany adres URL. |
| **`browser_navigate_back`** | Nawigacja | Cofnięcie do poprzedniej strony w historii przeglądarki. |
| **`browser_take_screenshot`** | Inspekcja | Wykonanie zrzutu ekranu w razie potrzeby weryfikacji wizualnej przez człowieka. |
| **`browser_tabs`** | Zakładki | Zarządzanie kartami przeglądarki (`list`, `switch`, `close`). |
| **`browser_close`** | Cykl życia | Bezpieczne zamknięcie sesji przeglądarki. |

> 🔒 **Dlaczego ukryliśmy niskopoziomowe narzędzia DOM?**  
> W klasycznym MCP narzędzia takie jak `browser_click`, `browser_fill_form`, `browser_snapshot` zaśmiecają prompt klienta (+2 500 tokenów na każde zapytanie) i zmuszają go do mikrozarządzania refami. Ukrycie ich wymusza czystą komunikację intencyjną. W razie potrzeby można je przywrócić flagą `--full-tools`.

---

## 🚀 Jak Odpalić?

### Krok 1: Wymagania wstępne
* Node.js w wersji **>= 18**
* Klucz API serwisu [OpenRouter](https://openrouter.ai/) z dostępem do modelu Decisions API (domyślnie `typesafe/jev-1.13`)

### Krok 2: Instalacja i konfiguracja `.env`
```bash
# Sklonuj repozytorium i zainstaluj zależności
git clone https://github.com/rossik86/playwright-mcp-jev.git
cd playwright-mcp-jev
npm install

# Utwórz plik .env na podstawie szablonu
cp .env.example .env
```

Wypełnij plik `.env`:
```env
JEV_API_KEY=sk-or-v1-twoj_klucz_openrouter
JEV_MODEL=typesafe/jev-1.13
JEV_BASE_URL=https://openrouter.ai/api
INTENT_ONLY=true
```

---

### Krok 3: Konfiguracja w klientach MCP

Dodaj serwer do konfiguracji swojego klienta MCP (np. `mcp.json` w Cursor / VS Code / Claude Desktop / Antigravity):

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

---

### Krok 4: Uruchomienie bezpośrednio z linii poleceń (CLI)

```bash
# 1. Tryb z widocznym oknem przeglądarki (headed)
node src/jev-proxy/cli.js

# 2. Tryb bezgłowy w tle (headless)
node src/jev-proxy/cli.js --headless

# 3. Uruchomienie z jawnymi parametrami
node src/jev-proxy/cli.js --headless --jev-api-key sk-or-v1-... --jev-model typesafe/jev-1.13
```

---

## ⚙️ Opcje i Flagi Uruchomieniowe

| Flaga CLI | Zmienna `.env` | Domyślnie | Opis |
| :--- | :--- | :--- | :--- |
| `--headless` | — | `false` (headed) | Uruchamia przeglądarkę Chromium w tle (bez GUI) |
| `--intent-only` | `INTENT_ONLY` | `true` | **Domyślny tryb semantyczny** — eksponuje tylko 7 narzędzi intencji, ukrywając narzędzia DOM |
| `--full-tools` | — | `false` | Wyłącza `intent-only` i odsłania pełen zestaw 20+ narzędzi Playwright MCP |
| `--jev-api-key <klucz>` | `JEV_API_KEY` | `""` | Klucz API do OpenRouter Decisions API |
| `--jev-model <model>` | `JEV_MODEL` | `typesafe/jev-1.13` | Model używany do podejmowania decyzji |
| `--jev-base-url <url>` | `JEV_BASE_URL` | `https://openrouter.ai/api` | Adres bazowy API OpenRouter |
| `--timeout-action <ms>` | — | `25000` | Czas oczekiwania na akcje kliknięć w ms (odporność na ciężkie SPA) |
| `--port <port>` | — | — | Opcjonalny port HTTP dla transportu SSE |

---

## 📊 Wyniki Benchmarków na Żywych Portalach

Przetestowano działanie systemu na realnych, złożonych portalach e-commerce i serwisach transakcyjnych w Polsce:

| Portal / Scenariusz | Vanilla Playwright MCP (DOM) | Browser Intent Layer (BIL + JEV) | Oszczędność tokenów | Wynik i Zachowanie BIL |
| :--- | :--- | :--- | :--- | :--- |
| **GrandBazaar.pl**<br>*„zamów kebaba aż do danych adresowych”* | **~2 244 tokenów**<br>(7.3 KB drzewa DOM) | **~125 tokenów**<br>(JEV: 4 979 tok, koszt $0.00017) | **94.4% mniej tokenów** 🚀 | ✅ **100% Sukces** (3 autonomiczne kroki: strona główna ➡️ menu ➡️ dodanie kebaba ➡️ kasa) |
| **Orange.pl**<br>*„dodaj telefon iphone z abonamentem i przejdź na dane”* | **~10 015 – 60 000+ tokenów**<br>(36.3 KB – 73 KB na krok) | **~201 tokenów**<br>(JEV: 12 077 tok, koszt $0.00043) | **98.0% mniej tokenów** 🚀 | 🔄 **4 autonomiczne kroki** przez konfigurator z automatycznym ominięciem Didomi CMP |
| **Empik.com**<br>*„dodaj książkę Stephen King Misery i przejdź na dane”* | **~65 766 tokenów!**<br>(**245.1 KB** gigantyczny DOM) | **~147 tokenów**<br>(JEV: 2 980 tok, koszt $0.00010) | **99.8% mniej tokenów!** 🚀 | 🛡️ **Safety Escalation** (ochrona: model nie kliknął w pusty koszyk przy braku książki na głównej) |

### 📈 Podsumowanie Zysków:
* **Redukcja tokenów kontekstu:** o **94.4% – 99.8%** w porównaniu z klasycznym zrzucaniem snapshota A11y.
* **Czysty kontekst roboczy:** Główny model nie jest zaśmiecany dziesiątkami kilobajtów kodu HTML/DOM.
* **Koszty wykonania:** Pojedynczy wieloetapowy proces kosztuje w JEV Decisions API od **$0.0001 do $0.0004 (mniej niż pół promila centa)**, podczas gdy w klasycznym podejściu wysłanie 65 000 tokenów do Claude 3.5 Sonnet / GPT-4o kosztuje **$0.20 – $0.50 za pojedynczy krok**.

---

## 🧪 Uruchamianie Benchmarków i Testów

W projekcie przygotowano dedykowane skrypty npm ułatwiające uruchamianie benchmarków i testów jednostkowych:

```bash
# 1. Uruchomienie benchmarku dla konkretnych portali:
npm run bil:benchmark:grandbazaar   # GrandBazaar.pl (kebab kraftowy - 100% sukces)
npm run bil:benchmark:orange        # Orange.pl (iPhone + konfigurator planu)
npm run bil:benchmark:empik         # Empik.com (Stephen King Misery - 99.8% redukcji)

# 2. Uruchomienie pełnego benchmarku porównawczego dla wszystkich scenariuszy
npm run bil:benchmark:both

# 3. Uruchomienie tylko silnika BIL (z tokenami i kosztami)
npm run bil:benchmark

# 4. Uruchomienie tylko silnika klasycznego Playwright MCP
npm run bil:benchmark:classic

# 5. Uruchomienie zestawu testów jednostkowych (55 testów, 100% pass)
npm run bil:test
```
