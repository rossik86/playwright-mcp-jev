# Browser Intent Layer (BIL)

Semantyczny wrapper nad Playwright MCP. LLM nie widzi DOM-u — wysyła cel,
BIL autonomicznie nawiguje.

## Architecture

```
LLM → browser_goal({ goal }) → BIL Controller
  → Snapshot Adapter → Normalizer → Candidate Retriever
  → JEV Resolver → Playwright Executor → Browser
```

## MCP Tools

- `browser_goal` — autonomiczna nawigacja do celu
- `jev_set_context` — (legacy) ręczne ustawienie kontekstu

## Usage

```bash
# Run unit tests
npm run bil:test

# Run E2E test (headed browser)
npm run bil:e2e

# Run benchmark
npm run bil:benchmark
```

## Components

| File | Responsibility |
|------|---------------|
| `types.js` | Type contracts & validators |
| `normalizer.js` | Snapshot → NormalizedElement[] |
| `candidate-retriever.js` | Filter & rank candidates |
| `jev-resolver.js` | JEV Decisions API integration |
| `playwright-executor.js` | Execute actions via ref |
| `loop-detector.js` | Cycle detection & max steps |
| `bil-controller.js` | Main navigation loop |
| `goal-handler.js` | MCP tool integration |
